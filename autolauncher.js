// From https://www.npmjs.com/package/auto-launch
const AutoLaunch = require('auto-launch');
const log = require('electron-log');

const autoLauncher = new AutoLaunch({
    name: 'Minecraft',
    path: '/Applications/Minecraft.app',
});

autoLauncher.enable();
autoLauncher.isEnabled()
.then(function(isEnabled){
    if(isEnabled){
		log.info('Auto launch enabled');
        return;
    }
    autoLauncher.enable();
})
.catch(function(err){
    log.error(error);
});