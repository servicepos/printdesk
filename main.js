const { app, Tray, Menu, MenuItem } = require('electron')
const os = require('os');
const isDev = require('electron-is-dev');
const path = require('path')
const log = require('electron-log')
const server = require('./server.js');

let iconpath;
if (os.platform() === 'win32')
  iconpath = path.join(__dirname, 'assets', 'servicepos.ico')
else
  iconpath = path.join(__dirname, 'assets', 'servicepos_16x16.png')

if (require('electron-squirrel-startup')) return app.quit();
require('./autoupdate')
require('./autolauncher');

const trayMenu = new Menu();
const versionNumbeItem = new MenuItem({
  label :`ServicePOS ${app.getVersion()}`,
  enabled : false
});
trayMenu.append(versionNumbeItem);

function createWindow() {

  const tray = new Tray(iconpath)
  if (isDev == false && os.platform() === 'darwin') app.dock.hide();
  tray.setContextMenu(trayMenu)
  server.run();
}

/* single instance production mode */
if (app.requestSingleInstanceLock() == false) {
  log.info('Another instance is running. Quitting...')
  app.quit();
} else {
  // // This method will be called when Electron has finished
  // // initialization and is ready to create browser windows.
  // // Some APIs can only be used after this event occurs.
  app.on('ready', createWindow)
}
