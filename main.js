const { app, Tray, Menu } = require('electron')
const os = require('os');
const path = require('path')
const log = require('electron-log')
const util = require(path.join(__dirname, 'util.js'));
let iconpath;
if (os.platform() === 'win32')
  iconpath = path.join(__dirname, 'assets', 'servicepos.ico')
else
  iconpath = path.join(__dirname, 'assets', 'servicepos_16x16.png')

if (require('electron-squirrel-startup')) return app.quit();
require('./autoupdate')
require('./autolauncher');

let tray = null
function createWindow() {

  tray = new Tray(iconpath)
  const label = `ServicePOS ${app.getVersion()}`;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: label, enabled: false,
    },
    {
      label: 'Quit', click: function () {
        app.isQuiting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
  if (util.isDev() == false && os.platform() === 'darwin') app.dock.hide();
  require('./server.js');
}

/* single instance production mode */
if (util.isDev() == false && app.requestSingleInstanceLock() == false) {
  log.info('Another instance is running. Quitting...')
  app.quit();
} else {
  // // This method will be called when Electron has finished
  // // initialization and is ready to create browser windows.
  // // Some APIs can only be used after this event occurs.
  app.on('ready', createWindow)
}
