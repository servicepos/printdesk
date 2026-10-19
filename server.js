const tmp = require('tmp');
const fs = require('fs');
const os = require('os');
const { app, Tray, Menu } = require('electron')
const path = require('path')
const log = require('electron-log');
const isDev = require('electron-is-dev');
const config = isDev ? require(path.join(__dirname, 'config-dev.json')) : require(path.join(__dirname, 'config.json'));
const { BrowserWindow } = require('electron')
const machineid = require('node-machine-id');
const express = require('express');
const bodyParser = require('body-parser');
const server = express();
const Store = require('electron-store');
const store = new Store();
const prompt = require('electron-prompt');
const ipmodule = require("ip");
const port = 43594;
const bamdesk = require('./bamdesk.js');
const openExplorer = require('open-file-explorer');
const crashReporter = require('electron').crashReporter;
const fetch = require('electron-fetch').default;
const { execFile } = require('child_process');

let hiddenWindow;
let iconpath;
let tray;
let lastSettingsReceivedTime = 0;
let lastPushedPrinterTime = 0;

if (os.platform() === 'win32')
  iconpath = path.join(__dirname, 'assets', 'customers1st.ico')
else
  iconpath = path.join(__dirname, 'assets', 'customers1st_16x16.png')

function setTrayMenu(status) {
  const items = [
    {
      label :`Customers 1st ${app.getVersion()}`,
      enabled : false
    }
  ];


  if (status) {
	crashReporter.addExtraParameter("Store_title", status.store.title);
	crashReporter.addExtraParameter("Store_id", status.store.id.toString());
    items.push({
      label :`User: ${status.store.title}`,
      enabled : false
    })

    if (status.bamdeskdevice) {
      items.push({
        label :`Terminal: ${status.bamdeskdevice.title}`,
        enabled : false
      })
    }
  } else {
    items.push({
      label :`Logging in...`,
      enabled : false
    })
  }
	items.push({
		label :`View log`,
		enabled : true,
		click : _ => {
			const logFile = log.transports.file.file;
			const logPath = path.dirname(logFile);
			openExplorer(logPath,  err=> {
				if(err) {
					log.error(err);
				}
			});
		}
	})
	items.push({
		label :`View crash dumps`,
		enabled : true,
		click : _ => {
			openExplorer(app.getPath('crashDumps'),  err=> {
				if(err) {
					log.error(err);
				}
			});
		}
	})
  const contextMenu = Menu.buildFromTemplate(items);
  tray.setContextMenu(contextMenu)
}

function run() {
	/* make global so it is never garbage collected */
	hiddenWindow = new BrowserWindow({ width: 400, height: 400, show: isDev })

	if (isDev) {
		hiddenWindow.openDevTools()
	}

	tray = new Tray(iconpath)
	setTrayMenu(null);

	server.use(function (req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
		next();
	});

	log.info(`is dev ${isDev}`)

	server.use(bodyParser.json({limit: '50mb'}));
	server.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

	server.use(express.json()); // for parsing application/json
	server.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

	server.post('/print', async function (req, res) {
		if (isQuitting()) {
			const msg = "app is quitting";
			log.error(msg)
			res.status(500);
			res.send({paylod: msg});
			return;
		}
		const payload = req.body.payload;
		const htmlTmpName = `${tmp.fileSync().name}.html`;
		/* Write the HTML as a UTF-8 Buffer rather than a raw string. Electron 42's
		   bundled Node 24 aborts with a fatal MaybeStackBuffer assertion when writing
		   certain multi-byte strings (receipts contain æøå/€), which hard-crashes the
		   whole app on print. Passing a Buffer bypasses the string->utf8 conversion. */
		fs.writeFileSync(htmlTmpName, Buffer.from(String(payload.html), 'utf8'));
		const pdfWindow = new BrowserWindow({width: 400, height: 400, show : false, webPreferences : { javascript : false }})
		/* Subscribe before loading: the first paint can happen before loadURL resolves. */
		const firstPaint = waitForFirstPaint(pdfWindow);
		await pdfWindow.loadURL(`file://${htmlTmpName}`, {"extraHeaders": "pragma: no-cache\n"});
		await firstPaint;
		log.info(payload.pdfOptions);
		log.info(payload.printer);
		log.info('Print with chrome');
		const marginType = payload.pdfOptions.marginType == 0 ? 'default' : 'none';
		let options = {
			...payload.pdfOptions,
			silent: true,
			printBackground: false,
			margins : {
				marginType,
			},
			deviceName: payload.printer.name,
		}
		/* Receipt and label templates use a custom page size. Silent printing on
		   Windows can pick the wrong resolution for those printers, which comes out
		   as a blank slip (electron/electron#41741), so pass the printer's own. */
		if (os.platform() === 'win32' && typeof payload.pdfOptions.pageSize === 'object') {
			options.dpi = await getPrinterDpi(payload.printer.name);
		}
		log.info({options});

		pdfWindow.webContents.print(options, function(success, failureReason) {
			pdfWindow.close();
			if (success) {
				log.info('print ok');
				res.send({payload: 'ok'});
			} else {
				log.error(failureReason);
				res.status(500)
				res.send({payload: failureReason, msg: 'could not print'});
			}
		});

	});

	server.get('/status', async function (req, res) {
		try {
			if (isQuitting()) throw "app is quitting"
			const status = await getStatus();
			res.send({ payload: status });
		} catch (e) {
			res.status(500);
			res.send({ paylod: res });
		}
	});

	server.post('/apitoken', function (req, res) {
		const payload = req.body.payload;
		const currentApitoken = store.get('apitoken');

		if (currentApitoken != payload) {
			store.set('apitoken', payload);

			/* force refresh of printers and settings */
			lastSettingsReceivedTime = 0;
			settingsLastReceived = 0;
		}

		res.status(200);
		res.send();
	})


	server.listen(port, () => log.info(`listening on port ${port}!`))

	getStoreAndDeviceSettingsLoop();
	pushPrintersLoop();

}

async function getStoreAndDeviceSettingsLoop() {

	let storeSettings;
 
	while(true){
		const apitoken = store.get('apitoken');
		// Gets storesettings once every 5 minutes, in order to relax the endpoint
		// If we get an authorization error, we reset timer and try again when we get a new apitoken
		const refreshTooOldSettings = (lastSettingsReceivedTime + 5*60*1000) < new Date().getTime();
		if (apitoken && refreshTooOldSettings){
			const headers = { 'Authorization': 'Bearer ' + apitoken };
			const result = await fetch(`${config.servicepos_url}/api/settings`, {
				method: 'GET',
				headers,
			}).then((result) => {
				if (result && result.status == 200) {
					return result;
				}

				if (result && result.status == 401) {
					// removing apitoken since it is no longer valid
					store.set('apitoken', "");
					return null;
				}
			}).catch((err) => {
				log.info(err);
			});
			
			if (result) {
				storeSettings = await result.json();
				storeSettings.featureFlags = storeSettings.featureFlags.reduce((p, c) => {
					p[c.key] = c.value;
					return p;
				}, {});
				lastSettingsReceivedTime = new Date().getTime();
				setTrayMenu({store: storeSettings.store});
			} else {
				storeSettings = null;
			}
		}

		// Gets bamdesk device for the store
		if (apitoken && storeSettings){
			await getBamdeskDevice(storeSettings);
		}

		await sleep(10000);
	}

}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBamdeskDevice(storeSettings) {

	const status = await getStatus();

	return fetch(`${config.bamdesk_url}/bamdesk/deviceInfo/${storeSettings.store.id}/${status.deviceid}`, {method: 'GET'})
		.then(res => res.json())
		.then((body) => {
			setTrayMenu({store: storeSettings.store, bamdeskdevice: body.id ? body : null});
	
			if (body) {
				log.info('pulled status', body);
				bamdesk.keepAlive(body.id ? body : null, storeSettings.featureFlags);
			}
		}).catch((err) => {
			log.error(err);
	});
}


async function pushPrintersLoop() {

	let lastPushedPrinterJSON = '';

	while(true){

		const apitoken = store.get('apitoken');

		const status = await getStatus();
		const refreshDisconnectedPrinters = (lastPushedPrinterTime + 5*60*1000) < new Date().getTime();
		// strinify object in order to compare previous settings
		const statusJSON = JSON.stringify({...status, ts: null});
		// no reason to update prints if the current settings are the same as previous
		// but to be sure that disconnected printers are registered we force push printers each 5 mintues
		if (apitoken && (refreshDisconnectedPrinters || statusJSON != lastPushedPrinterJSON)){
			lastPushedPrinterJSON = statusJSON;

			const headers = { 'apitoken': apitoken };
			await fetch(`${config.servicepos_url}/webbackend/api/PrintDesk/pushPrinters`, {
				method: 'POST',
				body: JSON.stringify({status: status}),
				headers,
			}).then(res => {
				if (res && res.status == 200){
					lastPushedPrinterTime = new Date().getTime();
				}
				if (res && res.status == 401) {
					// relax - invalid apitoken
					store.set('apitoken', "");
				}
			}).catch(err => {
					log.error(err);
			});
		}

		await sleep(10000);
	}

}

function promptLogin() {
	return prompt({
		title: 'Apitoken',
		label: 'Apitoken (Settings->Users)',
		width: 550,
		height: 150,
		value: '',
		inputAttrs: {
			type: 'text', required: true
		}
	})
		.then(r => {
			if (r === null) {
				app.quit();
			} else {
				log.info(r);
				setApiToken(r);
				return r;
			}
		})
		.catch(log.error);
}

async function getStatus() {
	const ip = ipmodule.address();
	const printers = await hiddenWindow.webContents.getPrintersAsync();
	const platform = os.platform();
	const deviceid = machineid.machineIdSync({ original: true })
	const ts = (new Date()).toISOString()
	const hostname = os.hostname()

	return {
		printers,
		platform,
		deviceid,
		ip,
		port,
		hostname,
		ts
	};
}

function isQuitting() {
	return !hiddenWindow || !hiddenWindow.webContents || hiddenWindow.webContents.isDestroyed();
}

const FIRST_PAINT_TIMEOUT_MS = 3000;
const PAINT_SETTLE_MS = 300;

/* Printing a hidden window before it has painted can produce a blank page.
   Resolves after the first paint plus a short settle delay, or after a timeout
   so a missing event can never block printing. */
function waitForFirstPaint(window) {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			log.info('ready-to-show did not fire, printing anyway');
			resolve();
		}, FIRST_PAINT_TIMEOUT_MS);
		window.once('ready-to-show', () => {
			clearTimeout(timer);
			setTimeout(resolve, PAINT_SETTLE_MS);
		});
	});
}

/* Most thermal receipt printers print at 203 dpi (8 dots/mm). */
const FALLBACK_PRINTER_DPI = 203;
const printerDpiCache = new Map();

/* Reads every printer's configured resolution from Windows. The printer name is
   matched in JS rather than passed to PowerShell, so it never needs escaping. */
function readPrinterResolutions() {
	const script = 'Get-CimInstance Win32_PrinterConfiguration | Select-Object Name, HorizontalResolution, VerticalResolution | ConvertTo-Json -Compress';
	return new Promise((resolve) => {
		execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000, windowsHide: true }, (error, stdout) => {
			if (error) {
				log.error('could not read printer resolutions', error);
				resolve([]);
				return;
			}
			try {
				const parsed = JSON.parse(stdout);
				resolve(Array.isArray(parsed) ? parsed : [parsed]);
			} catch (e) {
				log.error('could not parse printer resolutions', e);
				resolve([]);
			}
		});
	});
}

/* Resolution for a printer, as Electron's print dpi option. Only a resolution
   actually read from Windows is cached, so a failed lookup is retried. Drivers
   can report a negative quality constant instead of dpi; those use the fallback. */
async function getPrinterDpi(printerName) {
	if (printerDpiCache.has(printerName)) {
		return printerDpiCache.get(printerName);
	}
	const printer = (await readPrinterResolutions()).find(p => p.Name === printerName);
	const horizontal = printer?.HorizontalResolution > 0 ? printer.HorizontalResolution : FALLBACK_PRINTER_DPI;
	const vertical = printer?.VerticalResolution > 0 ? printer.VerticalResolution : horizontal;
	const dpi = { horizontal, vertical };
	log.info(`print resolution for ${printerName}`, dpi, printer ? 'from Windows' : 'fallback');
	if (printer) {
		printerDpiCache.set(printerName, dpi);
	}
	return dpi;
}

module.exports = {
	run
}
