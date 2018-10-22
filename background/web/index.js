(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { WebNavigation, Tabs, },
	'node_modules/web-ext-utils/browser/version': { blink, gecko, },
	'common/options': options,
}) => {
let debug; options.debug.whenChange(([ value, ]) => { debug = value; });

/**
 * Represents (the parts of) a style sheet that can be attached via `Tabs.insertCSS`.
 */
class ContentStyle {
	/**
	 * @param  {string}  url    Style source URL (currently only used for debugging).
	 * @param  {Sheet}   sheet  Sheet to apply. Will be stringified and not saved.
	 */
	constructor(url, sheet) {
		this.url = url; this.code = stringify(sheet);
		styles.add(this);
		toAdd.add(this.code); refresh();
	}

	/**
	 * @param  {Sheet}   sheet  Sheet to apply (instead of the previous one). Will be stringified and not saved.
	 */
	update(sheet) {
		testAlive(this); const old = this.code; this.code = stringify(sheet);
		if (this.code !== old) { toRemove.add(old); toAdd.add(this.code); refresh(); }
	}

	destroy() {
		if (!styles.has(this)) { return; }
		styles.delete(this);
		toRemove.add(this.code); refresh();
		this.code = this.url = null;
	}

	toJSON() { testAlive(this); return { url: this.url, code: this.code, }; }

	static fromJSON({ url, code, }) {
		return new ContentStyle(url, code);
	}
}

//// start implementation

function testAlive(self) { if (!styles.has(self)) { throw new TypeError(`ContentStyle method called on destroyed or invalid object`); } }

function stringify(sheet) {
	// in firefox 59, `@-moz-document` broke for styles not attached with `cssOrigin: 'user'` (see https://bugzilla.mozilla.org/show_bug.cgi?id=1035091)
	// so, as with `ChromeStyle`s, '!important' has to be added to every rule
	return sheet.toString({ minify: false, important: true, namespace: true, })
	+ `\n/* ${ Math.random().toString(32).slice(2) } */`; // avoid conflicts
}


/**
 * TODO:
 * It would probably be much more efficient to use `browser.contentScripts.register()`.
 * (And then maybe even use one contentScript for multiple Styles.)
 * See: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/contentScripts/register
 *
 * Currently, there are two blocking problems:
 *  1.) `script.remove()` does not remove the CSS from loaded tabs.
 *      Patches are welcome: https://bugzilla.mozilla.org/show_bug.cgi?id=1423323
 *  2.) There is no way to specify the `cssOrigin`, so `@-moz-document` rules won't work (https://bugzilla.mozilla.org/show_bug.cgi?id=1035091).
 *      I see two possible solutions:
 *       * Request a `cssOrigin` property either on the `contentScriptOptions` or each entry in its `.css`.
 *       * Use the content scripts `.matches` option to include it only on the desired domains in the first place.
 *         This should again be faster than injecting it everywhere and then filtering through `@document` blocks,
 *         but `.matches` only supports match patterns. They can emulate `url()`, `domain()`, and `url-prefix()`,
 *         but not `regexp()` includes, which again leaves two options:
 *          * Use `.register({ matches: [ ..., ], })` where possible, and the current implementation for `regexp()`.
 *          * Request RegExps in `.matches`.
 */

// TODO: handle pages that re-appear from the BF-cache

const toAdd = new Set, toRemove = new Set, styles = new Set;

// only listen while styles.size > 0
styles.add = function(item) {
	const was = this.size; Set.prototype.add.call(this, item);
	if (this.size === was || this.size !== 1) { return; }
	WebNavigation.onCommitted.addListener(onCommitted);
	WebNavigation.onDOMContentLoaded.addListener(onDOMContentLoaded);
};
styles.delete = function(item) {
	const was = this.size; Set.prototype.delete.call(this, item);
	if (this.size === was || this.size !== 0) { return; }
	WebNavigation.onCommitted.removeListener(onCommitted);
	WebNavigation.onDOMContentLoaded.removeListener(onDOMContentLoaded);
};

async function refresh() {
	const frames = (await (pending = getFrames())); // if the tabs are already being queried, this returns that promise
	if (!(toAdd.size || toRemove.size)) { return; } // and the function will exit here, because the previous call already cleared both sets

	frames.forEach(({ tabId, frameId, url, }) => {
		void url;
		toAdd.forEach(code => Tabs.insertCSS(tabId, { code, frameId, runAt: 'document_start', cssOrigin: 'user', }).catch(error => {
			debug >= 2 && console.error('Bad frame', tabId, frameId, url, error);
		}));
		toRemove.forEach(code => Tabs.removeCSS(tabId, { code, frameId, cssOrigin: 'user', }).catch(error => {
			debug >= 2 && console.error('Bad frame', tabId, frameId, url, error);
		}));
	});
	toAdd.clear(); toRemove.clear();
}

let pending = null; async function getFrames() {
	if (pending) { return pending; } const frames = [ ];
	(await Promise.all((await Tabs.query({
		discarded: false, url: '<all_urls>', // can't inject in other tabs anyway
	})).map(async ({ id: tabId, }) => { try {
		const inTab = (await WebNavigation.getAllFrames({ tabId, }));
		if (!inTab.length || !isScripable(inTab[0].url)) { return; }
		inTab.forEach(({ frameId, url, parentFrameId, }) =>
			isScripable(url) && frames.push({ tabId, frameId, parentFrameId, url, })
		);
	} catch (error) { console.error(error); } })));
	global.setTimeout(() => { pending = null; });
	return frames;
}

function onCommitted({ tabId, frameId, url, }) {
	// if (transitionQualifiers.includes('forward_back')) { } // TODO: there is a chance that the page comes from the FB-cache, but how can that be detected?

	// For subframes this fires too early, before the new frame can be targeted. The style would be inserted in the old frame.
	frameId === 0 && isScripable(url) && styles.forEach(({ code, }) =>
		Tabs.insertCSS(tabId, { frameId, code, runAt: 'document_start', cssOrigin: 'user', })
	);
}
function onDOMContentLoaded({ tabId, frameId, url, }) {
	// this fires late, but it is better than inserting in the old frame
	frameId !== 0 && isScripable(url) && styles.forEach(({ code, }) =>
		Tabs.insertCSS(tabId, { frameId, code, runAt: 'document_start', cssOrigin: 'user', })
	);
}

function patchEvent(listener) { return function(event) {
	event.url.startsWith('wyciwyg://') && (event.url = event.url.replace(/^wyciwyg:\/\/(?:\d+\/)?/, '')); // cached (subframe?) in Firefox, most likely a bug
	return listener(event);
}; }
onCommitted = patchEvent(onCommitted); // eslint-disable-line no-func-assign
onDOMContentLoaded = patchEvent(onDOMContentLoaded); // eslint-disable-line no-func-assign

function isScripable(url) {
	return !( // not accessible if:
		   (gecko && url.startsWith('https://addons.mozilla.org'))
		|| (blink && url === 'data:text/html,chromewebdata') // TODO: the `.url` of tabs/frames actually never holds this. This is what is internally set for the neterror (?) page in chrome
		|| !(/^(?:https?|file|ftp|app):\/\//).test(url)
	);
}

return ContentStyle;

}); })(this);
