AstroTools
==========

JS toolbox for astronomical software interoperation based on samp.js

Installation
============

AstroTools depends on [jQuery](http://jquery.com) and [modified sampjs](https://github.com/AnotherOneAckap/sampjs) library, so first you must include them

	<script type="text/javascript" src="http://code.jquery.com/jquery-1.9.1.js"></script>
	<script type="text/javascript" src="js/samp.js"></script>

Then astrotools library itself:

	<script type="text/javascript" src="js/astrotools.js"></script>

After document is loaded, you can configure and start Astrotools just like this

	<script type="text/javascript">
		$( function() {
			AstroTools.tableId = 'data';
			AstroTools.init();
		});
	</script>

