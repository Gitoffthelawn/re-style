(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { Tabs, },
	'node_modules/web-ext-utils/loader/views': { openView, },
	'node_modules/web-ext-utils/utils/': { reportError, reportSuccess, },
	'node_modules/es6lib/dom': { createElement, },
	'background/style': Style,
	'background/chrome/': ChromeSytle,
	'background/remote/': RemoteSytle,
	'background/remote/map-url': mapUrl,
	'background/util': { isSubDomain, },
}) => async (window, location) => {
const { document, } = window;

document.body.innerHTML = `
	<style>
		:root { font-family: Segoe UI, Tahoma, sans-serif; overflow: hidden; }
		:root, body { background: #424F5A; } body>* { filter: invert(1) hue-rotate(180deg); }
		:root { box-sizing: border-box; } * { box-sizing: inherit; }
		:root { width: 350px; margin-bottom: -1px; } body { width: 333px; margin 8px; }
		#restart { background: #F49F00; padding: 5px; position:fixed;top:0;left:0;right:0; } code { font-size: 120%; }
		#all { position: absolute; z-index: 1; top: 11px; right: 9px; }
		h3 { margin: 0; cursor: default; } #styles { margin-bottom: 10px; max-height: 250px; overflow-y: auto; }
		#styles:empty::after { content: '<none>'; opacity: .5; }
		.includes { margin-left: 30px; } .includes input { margin-left: 6px; }
		textarea { width: 100%; resize: vertical; max-height: 8.2em; min-height: 3.5em; overflow-y: scroll; word-break: break-all; }
	</style>
	<button id="all">All Styles</button>
	<h3>Active styles</h3>
	<div id="styles"></div>
	<select id="addTo"><option></option></select>
	<h3>Install style</h3>
	<textarea id="url" type="text" placeholder="URL to .css file"></textarea><br>
	<button id="add">Add style</button>
`;
const tab = location.activeTab !== Tabs.TAB_ID_NONE ? (await Tabs.get(location.activeTab)) : (await Tabs.query({ currentWindow: true, active: true, }))[0];


// restart notice
if (ChromeSytle.changed) { document.body.insertAdjacentHTML('afterbegin', `<div id="restart">
	The UI styles have changed. The browser has to be restarted to apply the changes.<br>
	You can do that e.g. by prssting <code>Shift</code>+<code>F2</code> and typing <code>restart</code> (then <code>enter</code>).
</div><style> body { margin-top: 105px; } #all { transform: translateY(97px); } </style>`); }


/// all styles button
document.querySelector('#all').addEventListener('click', _=>!_.button
	&& openView('styles', null, { useExisting: _=>_ !== location, }).then(() => location.view.close())
);


/// add style input
const input  = document.querySelector('#url');
input.value = (await mapUrl(tab.url, tab));


/// add style submit
const add = document.querySelector('#add');
add.addEventListener('click', event => {
	if (event.button) { return; }
	const url = input.value.trim(); add.disabled = true;
	RemoteSytle.add(url).then(style => {
		if (!style.name || (/^\d+$/).test(style)) {
			style.options.name.value = tab.title.split(/-|–|—|\||::|·/)[0].trim(); // TODO: should set the internal name field instead
		}
		reportSuccess(`Style added`, `from "${ url }"`);
		input.value = ''; add.disabled = false;
	}, error => {
		add.disabled = false;
		reportError(`Failed to add style from "${ url }"`, error);
	}, );
});


/// active styles list
const list = document.querySelector('#styles'), url = new global.URL(tab.url);
const styles = Array.from(Style, _=>_[1]).filter(style => (
	style.matches(url.href) || style.options.include.children.some(
		_=>_.values.current.some(domain => isSubDomain(domain, url.hostname))
	)
)).sort((a, b) => a.url < b.url ? -1 : 1);

styles.forEach(appendStyle); function appendStyle(style) {
	list.appendChild(createElement('div', { id: style.id, }, [
		createElement('label', [
			createElement('input', {
				type: 'checkbox', checked: !style.disabled,
				onchange: _=> (style.disabled = !_.target.checked),
			}),
			style.options.name.value +'',
			// createElement('a', { target: '_blank', href: '#styles#'+ style.id, }, [ '+', ]),
		]),
		createElement('div', { className: 'includes', }, style.options.include.children.map(include => {
			const matching = include.values.current.filter(domain => isSubDomain(domain, url.hostname));
			return !matching.length ? null
			: createElement('div', { id: style.id +'-'+ include.name, }, [
				include.model.title,
				createElement('input', {
					type: 'text', value: matching.join(' '),
					async onchange({ target, }) {
						const values = new Set(include.values.current);
						matching.forEach(value => values.delete(value));
						const value = target.value.trim();
						value && value.split(/\s+/g).forEach(value => values.add(value));
						(await include.values.replace(Array.from(values)));
						document.getElementById(style.id).remove();
						if (style.matches(url.href) || style.options.include.children.some(
							_=>_.values.current.some(domain => isSubDomain(domain, url.hostname))
						)) { appendStyle(style); }
					},
				}),
			]);
		})),
	]));
}


/// "add domain to"
const addTo = document.querySelector('#addTo');
if ((/^https?:$/).test(url.protocol)) {
	for (const [ , style, ] of Style) { for (const include of style.options.include.children) {
		addTo.appendChild(createElement('option', { props: { style, include, }, }, [ `${include.model.title} (${style.options.name.value})`, ]));
	} }
	if (addTo.children.length > 1) {
		const domain = url.hostname.replace(/^www[.]/, '');
		addTo.children[0].textContent = `Add ${domain} to ...`;
		addTo.onchange = async () => {
			if (addTo.selectedIndex === 0) { return; }
			const { style, include, } = addTo.children[addTo.selectedIndex].props;
			(await include.values.splice(0, 0, domain));
			const row = document.getElementById(style.id);
			row && row.remove(); appendStyle(style);
			addTo.selectedIndex = 0;
		};
	} else { addTo.style.display = 'none'; }
} else { addTo.style.display = 'none'; }

}); })(this);
