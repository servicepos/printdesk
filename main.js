const { app, Tray, Menu } = require('electron')
const os = require('os');
const path = require('path')
const util = require(path.join(__dirname, 'util.js'));
let iconpath;
if (os.platform() === 'win32')
  iconpath = path.join(__dirname, 'assets', 'servicepos.ico')
else
  iconpath = path.join(__dirname, 'assets', 'servicepos.png')

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

// // This method will be called when Electron has finished
// // initialization and is ready to create browser windows.
// // Some APIs can only be used after this event occurs.
app.on('ready', createWindow)
