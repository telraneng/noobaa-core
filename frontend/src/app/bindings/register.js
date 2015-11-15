export default function register(ko) {
	ko.bindingHandlers.let = 		require('./let');
	ko.bindingHandlers.visibility = require('./visibility');
	ko.bindingHandlers.href = 		require('./href');
	ko.bindingHandlers.scroll = 	require('./scroll');
}