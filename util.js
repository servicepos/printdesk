
const process = require('process');

module.exports = {
	isDev : function() {
		return process.mainModule.filename.indexOf('app.asar') === -1;
	}
}