/** The report is a standalone document. Its stylesheet and script travel with it. */
export const traceReportStyle = `
:root {
	font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#263248;
	background:#f4f6fa; font-synthesis:none; --line:#e3e8f0; --job:#8869cc;
	--step:#4c82da; --failure:#d65363; --timeline-width:500px; --label-width:315px
}
* {
	box-sizing:border-box
}
body {
	margin:0
}
button,input {
	font:inherit
}
button,a,input {
	outline-offset:4px
}
button {
	cursor:pointer
}
a {
	color:inherit; text-decoration:none
}
button:hover {
	background:#edf1f9
}
button:focus-visible,a:focus-visible {
	outline:2px solid #5b80db
}
[hidden] {
	display:none!important
}
.masthead {
	height:72px; padding:0 44px; display:flex; align-items:center; justify-content:space-between;
	border-bottom:1px solid var(--line); background:white
}
.brand {
	display:flex; align-items:center; gap:10px; font-size:17px; font-weight:650;
	letter-spacing:-.6px
}
.brand-mark {
	display:grid; place-items:center; width:29px; height:29px; border-radius:8px;
	background:#263248; color:white; font-family:Georgia,serif; font-size:25px;
	font-style:italic; line-height:1
}
.brand-detail {
	color:#708096; font-weight:400; margin-left:8px
}
.attempt {
	color:#718096; font-size:12px; font-variant-numeric:tabular-nums
}
main {
	max-width:1800px; margin:auto; padding:38px 44px 20px
}
.heading {
	display:flex; align-items:center; justify-content:space-between; gap:24px
}
.eyebrow {
	font-size:12px; color:#66758c; margin:0 0 9px
}
h1 {
	font-size:32px; font-weight:620; letter-spacing:-1px; line-height:1.2;
	margin:0
}
.subtitle {
	font-size:13px; color:#5e6e86; margin:14px 0 0
}
.subtitle span {
	padding:0 9px; color:#b6bfcd
}
.subtitle b {
	color:#42516a; font-weight:600
}
.source-link {
	color:#5371ae; font-size:12px; white-space:nowrap
}
.source-link:hover {
	text-decoration:underline
}
.overview {
	margin:28px 0 30px; padding:12px 18px; background:#edf1f8; border-radius:10px;
	max-height:175px; overflow:auto
}
.overview-job {
	display:grid; grid-template-columns:230px 1fr 85px; align-items:center;
	gap:20px; min-height:23px; font-size:11px; color:#68768d
}
.overview-job>span {
	white-space:nowrap; overflow:hidden; text-overflow:ellipsis
}
.overview-job b {
	text-align:right; font-weight:500; font-variant-numeric:tabular-nums
}
.bar {
	display:block; width:100%; overflow:visible
}
.bar rect {
	fill:var(--step)
}
.bar.job rect {
	fill:var(--job)
}
.bar.workflow rect {
	fill:#697d9b
}
.bar.failure rect {
	fill:var(--failure)
}
.bar.cancelled rect {
	fill:#c38c35
}
.bar.muted rect {
	fill:#a8b2c4
}
.bar.action rect, .bar.group rect {
	fill:#36a094
}
.focus-interval {
	border:1px solid #c9d6e7; border-radius:6px; padding:7px 10px; background:#f5f8fc;
	color:#304969; cursor:pointer; margin-top:12px; display:block; font:inherit
}
.plot .bar {
	overflow:hidden
}
.explorer {
	border:1px solid #dbe2ee; border-radius:12px; background:white; box-shadow:0 5px 25px #243b6410;
	overflow:hidden
}
.toolbar {
	min-height:60px; display:flex; gap:20px; align-items:center; justify-content:space-between;
	padding:12px 18px; border-bottom:1px solid var(--line)
}
.search {
	display:flex; align-items:center; gap:10px; color:#7c8ca4; min-width:180px;
	flex:1
}
.search>span {
	font-size:22px; line-height:1
}
.search input {
	border:0; background:none; width:100%; font-size:12px; color:#334359; padding:4px
}
.search input::placeholder {
	color:#8e9aae
}
.toolbar-actions {
	display:flex; align-items:center; gap:6px
}
.toolbar button {
	background:transparent; border:1px solid transparent; border-radius:5px;
	font-size:11px; color:#64748c; padding:6px 8px; white-space:nowrap
}
.toolbar button:hover {
	background:#f0f3f9
}
.toolbar button[aria-pressed=true] {
	color:#b83f50; background:#fff0f2; border-color:#f5cbd2
}
.zoom {
	font-size:11px; color:#7e8a9d; display:flex; align-items:center; gap:9px;
	border-left:1px solid var(--line); margin-left:5px; padding-left:14px
}
.zoom input {
	width:65px; accent-color:#5975b8
}
.workspace {
	display:grid; grid-template-columns:minmax(0,1fr) 250px
}
.trace-scroll {
	overflow:auto; max-height:720px; min-height:430px
}
.trace-body {
	min-width:calc(var(--label-width) + var(--timeline-width) + 90px)
}
.row {
	display:grid; grid-template-columns:var(--label-width) minmax(var(--timeline-width),1fr) 90px;
	align-items:center; height:39px; border-bottom:1px solid #f0f3f7
}
.ruler {
	height:40px; background:#f9fbfd; color:#66758c; font-size:10px; position:sticky;
	top:0; z-index:3; border-bottom:1px solid var(--line)
}
.span-heading {
	padding-left:19px; background:#f9fbfd; position:sticky; left:0; z-index:2
}
.span-heading span {
	display:inline-block; background:#eaf0f7; color:#7f8fa8; padding:1px 5px;
	border-radius:4px; margin-left:6px
}
.duration-heading {
	text-align:right; padding-right:16px
}
.ticks {
	display:flex; justify-content:space-between; font-variant-numeric:tabular-nums
}
.ticks span:first-child {
	transform:translateX(0)
}
.ticks span:last-child {
	transform:translateX(0)
}
.node {
	margin:0
}
.node>summary {
	list-style:none; cursor:pointer
}
.node>summary::-webkit-details-marker {
	display:none
}
.node>summary::marker {
	content:""
}
.span-label {
	display:flex; align-items:center; gap:8px; padding:0 16px 0 calc(14px + var(--depth)*15px);
	height:100%; position:sticky; left:0; z-index:1; background:white; overflow:hidden;
	min-width:0
}
.span-name {
	font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
	letter-spacing:-.1px
}
.chevron {
	font-size:18px; line-height:1; width:10px; flex-shrink:0; color:#9aabc0;
	transform-origin:center; transition:transform .12s
}
.node[open]>.row .chevron {
	transform:rotate(90deg)
}
.status-dot {
	width:5px; height:5px; flex-shrink:0; border-radius:50%; background:#71ad9b
}
.failure .status-dot {
	background:var(--failure)
}
.cancelled .status-dot {
	background:#c38c35
}
.muted .status-dot {
	background:#bcc5d2
}
.step-count {
	color:#74839a; font-size:10px; margin-left:auto; padding-left:7px
}
.row.job .span-name {
	font-weight:600
}
.row.workflow .span-name {
	font-weight:650
}
.row.job {
	background:#faf9fe
}
.row.job .span-label {
	background:#faf9fe
}
.row.workflow {
	background:#f3f6fa
}
.row.workflow .span-label {
	background:#f3f6fa
}
.row.failure {
	background:#fff8f9
}
.row.failure .span-label {
	background:#fff8f9
}
.row.selected,.row.selected .span-label {
	background:#eaf1ff
}
.duration {
	font-size:11px; font-variant-numeric:tabular-nums; text-align:right; color:#6c7b92;
	padding-right:16px
}
.failure .duration {
	color:#be4e5d
}
.plot {
	height:100%; border:0; border-radius:0; background-color:transparent; background-image:linear-gradient(to right,#e6ebf2 1px,transparent 1px);
	background-size:25% 100%; padding:0; min-width:0; text-align:left
}
.plot:hover {
	background-color:#edf3ff
}
.plot .bar {
	height:36px
}
.unmeasured {
	color:#7b879a; font-size:10px; padding-left:4px; white-space:nowrap
}
.plot .unmeasured {
	font-style:italic
}
#empty {
	font-size:13px; color:#8591a3; padding:30px; text-align:center
}
#inspector {
	border-left:1px solid var(--line); padding:25px 22px; background:#fbfcfe;
	overflow-wrap:anywhere; max-height:760px; overflow:auto
}
.inspector-kicker {
	font-size:11px; color:#66758c; margin:0 0 11px; text-transform:capitalize
}
#inspector h2 {
	font-size:19px; line-height:1.35; letter-spacing:-.4px; margin:0 0 13px;
	font-weight:580
}
#inspector>p {
	font-size:12px; line-height:1.8; color:#66758c
}
#inspector h3 {
	font-size:11px; font-weight:600; color:#78869c; border-top:1px solid var(--line);
	margin:23px 0 16px; padding-top:20px
}
dl {
	margin:20px 0 22px
}
dt {
	font-size:10px; color:#66758c; margin-top:13px
}
dd {
	font-size:12px; color:#4d607c; margin:5px 0 0; font-variant-numeric:tabular-nums;
	line-height:1.5
}
.mono {
	font-size:10px; font-family:ui-monospace,monospace
}
.attributes dt {
	font-family:ui-monospace,monospace; font-size:9px
}
.attributes dd {
	font-size:11px
}
.result {
	display:inline-block; font-size:10px; background:#eaf5ef; color:#4e8977;
	padding:4px 8px; border-radius:4px
}
.result.muted {
	color:#66758c; background:#edf0f5;
}
.result.failure {
	color:#ba4253; background:#ffe9ed
}
.result.cancelled {
	color:#9f7428; background:#fcf3df
}
.legend {
	display:flex; gap:14px; margin-top:30px; font-size:10px; color:#7a879b
}
.legend span:before {
	content:""; display:inline-block; width:5px; height:5px; border-radius:2px;
	margin-right:5px
}
.legend-job:before {
	background:var(--job)
}
.legend-step:before {
	background:var(--step)
}
.legend-failure:before {
	background:var(--failure)
}
footer {
	display:flex; justify-content:space-between; gap:20px; margin-top:19px;
	font-size:10px; color:#74839a
}
@media(max-width:1100px) {
	.workspace {
		grid-template-columns:minmax(0,1fr)
	}
	#inspector {
		border-left:0; border-top:1px solid var(--line); max-height:300px
	}
	.trace-scroll {
		max-height:600px
	}
	.legend {
		margin-top:12px
	}
}
@media(max-width:700px) {
	:root { --label-width:190px; }
	.span-label,.span-heading { position:static; }
	.masthead {
		padding:0 18px; height:60px
	}
	main {
		padding:27px 15px 16px
	}
	h1 {
		font-size:26px
	}
	.heading {
		align-items:flex-start
	}
	.heading>.source-link {
		display:none
	}
	.subtitle {
		font-size:11px
	}
	.subtitle span {
		padding:0 4px
	}
	.overview-job {
		grid-template-columns:150px 1fr 63px; gap:10px
	}
	.toolbar {
		align-items:stretch; flex-direction:column; gap:8px
	}
	.toolbar-actions {
		justify-content:space-between
	}
	.zoom {
		padding-left:8px
	}
	.overview {
		padding:12px; margin:23px 0
	}
	.trace-scroll {
		min-height:300px
	}
	footer {
		font-size:9px
	}
	.brand {
		font-size:16px
	}
}
@media(prefers-reduced-motion:reduce) {
	* {
		transition:none!important
	}
}
`;

export const traceReportScript = `
const nodes = [...document.querySelectorAll('.node')];
const search = document.querySelector('input[type=search]');
const errors = document.getElementById('errors');
const inspector = document.getElementById('inspector');
const root = nodes[0];
let focusNode = root;
let selectedNode = root;
const firstJob = root.querySelector(':scope > details');
if (firstJob) firstJob.open = true;
function filter() {
  const query = search.value.toLocaleLowerCase();
  const errorsOnly = errors.getAttribute('aria-pressed') === 'true';
  const matching = new Set();
  for (const node of nodes) {
    const parent = node.parentElement.closest('.node');
    if (node.dataset.name.includes(query) || matching.has(parent)) matching.add(node);
  }
  for (const node of [...nodes].reverse()) {
    const inWindow = focusNode.contains(node) || node.contains(focusNode);
    const matches = inWindow && matching.has(node) && (!errorsOnly || node.dataset.failed === 'true');
    const childMatches = [...node.querySelectorAll(':scope > .node')].some(child => !child.hidden);
    node.hidden = !(matches || childMatches);
    if ((query || errorsOnly) && childMatches && node.tagName === 'DETAILS') node.open = true;
  }
  const count = nodes.filter(node => !node.hidden).length;
  document.getElementById('visible-count').textContent = String(count);
  document.getElementById('empty').hidden = count > 0;
}
search.addEventListener('input', filter);
errors.addEventListener('click', () => { errors.setAttribute('aria-pressed', String(errors.getAttribute('aria-pressed') !== 'true')); filter(); });
document.getElementById('expand').addEventListener('click', () => nodes.forEach(node => { if (node.tagName === 'DETAILS') node.open = true; }));
document.getElementById('collapse').addEventListener('click', () => nodes.forEach(node => { if (node.tagName === 'DETAILS') node.open = node === root; }));
document.getElementById('zoom').addEventListener('input', event => document.documentElement.style.setProperty('--timeline-width', 500 * Number(event.target.value) + 'px'));
function focusInterval(node) {
  focusNode = node;
  const total = Math.max(Number(root.dataset.duration), 1);
  const offset = Number(node.dataset.start) / total * 1000;
  const width = Math.max(Number(node.dataset.duration), 0.001) / total * 1000;
  document.querySelectorAll('.plot svg').forEach(svg => {
    svg.setAttribute('viewBox', offset + ' 0 ' + width + ' 36');
    const rect = svg.querySelector('rect');
    rect.setAttribute('width', String(Math.max(Number(rect.dataset.width), width / 1000)));
    rect.setAttribute('rx', String(width / 500));
  });
  document.querySelectorAll('.ticks span').forEach((tick, index) => {
    const elapsed = Number(node.dataset.duration) * index / 4;
    tick.textContent = elapsed < 1000 ? elapsed.toFixed(1) + ' ms' : (elapsed / 1000).toFixed(2) + ' s';
  });
  document.getElementById('reset-time').disabled = node === root;
  document.getElementById('time-window').textContent = node === root ? 'Full workflow' : node.querySelector('.span-name').textContent;
  node.querySelectorAll('details').forEach(child => { child.open = true; });
  if (node.tagName === 'DETAILS') node.open = true;
  filter();
}
document.getElementById('reset-time').addEventListener('click', () => focusInterval(root));
inspector.addEventListener('click', event => {
  if (event.target.closest('.focus-interval')) focusInterval(selectedNode);
});
document.querySelectorAll('.inspect').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  document.querySelector('.row.selected')?.classList.remove('selected');
  button.parentElement.classList.add('selected');
  const node = button.closest('.node');
  selectedNode = node;
  inspector.replaceChildren(node.querySelector(':scope > template').content.cloneNode(true));
}));
`;
