(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { Tabs, },
	'node_modules/web-ext-utils/loader/views': { openView, },
	'node_modules/web-ext-utils/utils/': { reportError, reportSuccess, },
	'node_modules/es6lib/dom': { createElement, },
	'background/local/': Local,
	'background/remote/': Remote,
	'background/remote/map-url': mapUrl,
}) => async ({ document, }, location) => {

document.body.innerHTML = `
	<style>
		:root { background: #424F5A; filter: invert(1) hue-rotate(180deg); font-family: Segoe UI, Tahoma, sans-serif; }
		#options { position: absolute; top: 11px; right: 9px; }
		h3 { margin: 0; cursor: default; } #styles { margin-bottom: 10px; }
		#styles:empty::after { content: '<none>'; opacity: .5; }
		textarea { resize: vertical; max-height: 8.2em; min-height: 3.5em; overflow-y: scroll; word-break: break-all; }
	</style>
	<button id="options">Options</button>
	<h3>Active styles</h3>
	<div id="styles"></div>
	<h3>Install style</h3>
	<textarea id="url" type="text" placeholder="URL to .css file" style="width:300px;resize:vertical;"></textarea><br>
	<button id="add">Add style</button>
`;

document.querySelector('#options').addEventListener('click', _=>!_.button && openView('options', null, { useExisting: _=>_ !== location, }).then(() => location.view.close()));

const tab = location.activeTab !== Tabs.TAB_ID_NONE ? (await Tabs.get(location.activeTab)) : (await Tabs.query({ currentWindow: true, active: true, }))[0];

const input  = document.querySelector('#url');
input.value = (await mapUrl(tab.url, tab));

const add = document.querySelector('#add');
add.addEventListener('click', event => {
	if (event.button) { return; }
	const url = input.value.trim(); add.disabled = true;
	Remote.add(url).then(
		() => { reportSuccess(`Style added`, `from "${ url }"`); input.value = ''; add.disabled = false; },
		error => { reportError(`Failed to add style from "${ url }"`, error); add.disabled = false; },
	);
});

const list = document.querySelector('#styles');
const styles = [ ]; [ Remote, Local, ].forEach(_=>_.get().forEach(_=>_.matches(tab.url) && styles.push(_)));
styles.forEach(style => {
	list.appendChild(createElement('div', [
		createElement('label', [
			createElement('input', {
				type: 'checkbox', checked: !style.disabled,
				onchange: _=> (style.disabled = !_.target.checked),
			}),
			style.options.name.value +'',
		]),
	]));
});

}); })(this);
