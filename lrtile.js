// Copyright 2019 Google LLC
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     https://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Move/resize windows with two modifiers and arrows.
// ChromeOS: Ctr+Shift+Arrow Ctrl+Search+Arrows expand/shrink

// Configurable options
let lrOptions = { on: 1, rows: 6, cols: 6, border: 2, step: 2, logLevel: 0 };

// Available displays, updated on change.
let lrDisplays = new Array();

// LOGGING: console.log() uses two separate outputs:
// * background:  go to chrome://extensions/ and click on
//                inspect views BACKGROUND PAGE for the extension
// * options: right click on the form and select Inspect

// printf-like logging, no deep object print
function L(level, ...args) {
    if (1 || level <= lrOptions.logLevel) {
        console.log(PF(...args));
    }
}

function PF() {  // simplified printf
    let n = arguments.length, res = arguments[0];
    for (let i = 1; i < n; i++) {
        res = res.replace(/%[dus]/, arguments[i]);
    }
    return res;
}

function g(id) { return document.getElementById(id); }

function clGet(entry, fn) {  // Local storage read + logging
    chrome.storage.local.get(entry, ret => {
        console.log("GET ", entry, " returns ", ret);
        fn(ret);
    });
}

function openKeyConfig() {
    chrome.windows.create({type: "popup",
	url: "chrome://extensions/configureCommands" });
}

// Returns the display area that contains the top left corner of the window.
function getDisplayArea(x, y) {
    for (i = 0; i < lrDisplays.length; i++) {
        const d = lrDisplays[i].workArea;
        if (x >= d.left && x < d.left + d.width &&
            y >= d.top && y < d.top + d.height) {
            return [ d.left, d.top, d.width, d.height ];
        }
    }
    return null;
}

// Handler for the various commands.
function doCmd(cmd, win) {
    if (!lrOptions.on) return;
    if (!win) return L(0, "no window, nothing to do");
    let [wX, wY, wW, wH] = [ win.left, win.top, win.width, win.height ];
    L(0, "CMD %s window %dx%d@%d,%d type %s id %s",
      cmd, wW, wH, wX, wY, win.type, win.id);

    // Chrome already excludes space for the menubar at the top or bottom.
    const [mX, mY, mW, mH] = getDisplayArea(wX, wY);
    let rows = Math.max(lrOptions.rows, 4);
    let cols = Math.max(lrOptions.cols, 4);
    if (mW > 3000) cols *= 2;  // adjust for 4k display
    if (mH > 1500) rows *= 2;
    const [minW, minH] = [lrOptions.step, lrOptions.step];
    const [dX, dY] = [Math.floor(mW / cols), Math.floor(mH / rows)];

    // x0,y0 x1,y1 are window coordinates in grid units relative to the display.
    let x0 = Math.round((wX - mX) / dX), y0 = Math.round((wY - mY) / dY);
    let x1 = Math.round((wX + wW - mX) / dX), y1 = Math.round((wY + wH - mY) / dY);
    // Enforce min size.
    if (x1 - x0 < minW) x1 = Math.min(cols, x0 + minW); // first, expand right
    if (x1 - x0 < minW) x0 = Math.max(0, x1 - minW); // then expand left.
    if (x1 - x0 < minW) return L(0, "screen too narrow!");

    if (y1 - y0 < minH) y1 = Math.min(rows, y0 + minH); // first, expand low
    if (y1 - y0 < minH) y0 = Math.max(0, y1 - minH); // then expand top.
    if (y1 - y0 < minH) return L(0, "screen too short!");

    const o_x0 = x0, o_x1 = x1, o_y0 = y0, o_y1 = y1; // save old position.

    L(0, "  before: %d,%d %d,%d  absolute %d,%d %d,%d",
      x0, y0, x1, y1, mX + x0 * dX, mY + y0 * dY, mX + x1 * dX, mY + y1 * dY);
    // Processing: change x0 x1 y0 y1 as fit.
    switch (cmd.substring(3)) { // drop initial XX- prefix
    default:
	L(0, "unrecognized command %s", cmd);
	break;

    case 'lr-full':
	x0 = 0; y0 = 0; x1 = cols; y1 = rows;
	break;

    case 'lr-wide':
	if (x1 < cols) x1++;
	else if (x0 > 0) x0--;
	break;

    case 'lr-narrow':
	if (x1 - x0 > minW) x1--;
	break;

    case 'lr-tall':
	if (y1 < rows) y1++;
	else if (y0 > 0) y0--;
	break;

    case 'lr-short':
	if (y1 - y0 > minH) y1--;
	break;

    case 'lr-left':
	if (x0 > 0) { x0--; x1--; }
	else if (x1 - x0 > minW) x1--;
	break;

    case 'lr-right':
	if (x1 < cols) { x0++; x1++; }
	else if (x0 < cols - minW && x1 - x0 > minW) x0++;
	break;

    case 'lr-down':
	if (y1 < rows) { y0++; y1++; }
	else if (y0 < rows - minH && y1 - y0 > minH) y0++;
	break;

    case 'lr-up':
	if (y0 > 0) { y0--; y1--; }
	else if (y1 - y0 > minH) y1--;
	break;
    }

    L(0, "  after:  %d,%d %d,%d  absolute %d,%d %d,%d",
      x0, y0, x1, y1, mX + x0 * dX, mY + y0 * dY, mX + x1 * dX, mY + y1 * dY);

    if (x0 == o_x0 && x1 == o_x1 && y0 == o_y0 && y1 == o_y1) return;
    // Compute new position
    wX = mX + x0 * dX;
    wW = (x1 - x0) * dX - lrOptions.border;
    wY = mY + y0 * dY;
    wH = (y1 - y0) * dY - lrOptions.border;

    chrome.windows.update(win.id, { left: wX, top: wY, width: wW, height: wH });
}

function getLrDisplays() {
    chrome.system.display.getInfo(displays => {
	console.log("LRDisplay Info", displays);
	lrDisplays = displays;
    });
}

function loadOptions() { clGet(lrOptions, ret => { lrOptions = ret; } ); };

function initLrTile() {
    loadOptions();
    getLrDisplays(); // initialize
    chrome.system.display.onDisplayChanged.addListener(getLrDisplays);
    chrome.runtime.onMessage.addListener(loadOptions);  // msg from options page
    chrome.commands.onCommand.addListener(cmd => {
        // windowTypes = normal, popup, devtools, [panel, app]. Unfortunately
        // app and panel are not visible to chrome extensions.
        const wt = {"windowTypes": Object.values(chrome.windows.WindowType)};
        chrome.windows.getLastFocused(wt, win => { doCmd(cmd, win) });
    });

    if (0) {  // Optional: open options page
        chrome.windows.create({type: "normal",
	    url: "chrome://extensions/?options="+chrome.runtime.id});
    }
    openKeyConfig();
}

function initOptionsPage() {
    // Build a <table> with current key mappings and link to update
    chrome.commands.getAll(function(commands) {
	const change = "<a id='set_keys' href='#'>(change)</a>";
	let t = "<tr><th>Key" + change + "</th><th>Action</th></tr>";
	commands.forEach(cmd => {
	    const val = cmd.shortcut.replace(" Arrow","");
	    t += "<tr><td>" + val + "</td><td>" +
                 cmd.description + "</td></tr>";
	});
	g('keys').innerHTML = '<table>' + t + '</table>';
	g('set_keys').addEventListener('click', openKeyConfig);
    });

    // restore input fields from local storage.
    clGet(lrOptions, ret => {
	lrOptions = ret;
	g('on').checked = ret.on;
	for (i in lrOptions) if (g(i)) g(i).value = lrOptions[i];
    });

    const doSave = (ev) => {
	for (let i in lrOptions) if (g(i)) lrOptions[i] = g(i).value;
	lrOptions.on = g('on').checked;
	console.log("--- Saved values", lrOptions);
	chrome.storage.local.set(lrOptions);
	chrome.runtime.sendMessage({"update": true});
	window.close();
    };
    // XXX how to attach to document close?
    g('save').addEventListener('click', doSave);
}

// Initialize
window.location.pathname.match(/generated/) ? initLrTile() : initOptionsPage();
