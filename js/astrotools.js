var AstroTools = (function() {
	var SAMPConnection;
	var ClientTracker;
	var waitingForHub;
	var isHubOnlineInterval;
	var defaultHubUrl = 'http://www.starlink.ac.uk/topcat/topcat-lite.jnlp';

	var UI = {
		init: function() {
			$('body').append('<div id="astrotools-ui-container"><span class="vo-mode-indicator"></span><button class="vo-mode-switcher"></button><ul id="astrotools-client-list"></ul></div>');
			if ( SAMPConnection ) {
				UI.VOMode('on');
			}
			else {
				UI.VOMode('off');
			}
		},
		VOMode: function(mode) {
			switch (mode) {
				case 'on':
					$('#astrotools-ui-container .vo-mode-indicator').text('on');
					$('#astrotools-ui-container .vo-mode-switcher')
						.text('off')
						.off('click')
						.on( 'click', function() { session.set('VOMode', '0'); disconnect(); } )
						.removeAttr('disabled');
					break;
				case 'connecting':
					$('#astrotools-ui-container .vo-mode-indicator').text('connecting');
					$('#astrotools-ui-container .vo-mode-switcher').attr('disabled', 'disabled');
					break;
				case 'off':
					$('#astrotools-ui-container .vo-mode-indicator').text('off')
					$('#astrotools-ui-container .vo-mode-switcher')
						.text('on')
						.off('click')
						.on( 'click', function() { session.set('VOMode', '1'); connect(); } )
						.removeAttr('disabled');
					break;
			}
		},
		updateClientList: function() {
			$('#astrotools-client-list').html('');
			$.each( ClientTracker.metas, function( id, meta ) {
				if ( meta['samp.name'] && id != 'hub' && meta['samp.name'] != 'AstroTools' ) {
					$('#astrotools-client-list').append(
						 $('<li>', { text: meta['samp.name'], title: meta['samp.description.text'] } ).prepend( $('<img>', { src: meta['samp.icon.url'] } ) )
					);
				}
			});
		},
		clearClientList: function() {
			$('#astrotools-client-list').html('');
		}
	}

	function init( options ) {
		if ( AstroTools.isStarted ) return undefined;
		
		defaultHubUrl = options['defaultHubUrl'] || defaultHubUrl;
		UI.init();
		// if we store private-key on cookies we no need anymore to disconnect on unload
		// $(window).unload( disconnect );

		//NB can we check seesion for previous connection and re-use it?
		if ( session.get('VOMode') == 1 ) connect();
		
		AstroTools.isStarted = true;
	}

	function connect() {
		UI.VOMode('connecting');
		var pk = session.get('PrivateKey');
		if ( pk && pk != undefined ) {
			onConnect( new samp.Connection({ 'samp.private-key': pk }) );
			return;
		}
		if ( SAMPConnection && SAMPConnection.closed == false ) {
			UI.VOMode('on');
			return; 
		}
		samp.register( 'AstroTools', onConnect, onConnectionError );
	}

	function onError() {
		SAMPConnection.close;
		session.set( 'PrivateKey', '' );
		UI.VOMode('off');
		UI.clearClientList();
	}

	function noop() {	}

	function disconnect() {
		/*if ( SAMPConnection ) {
			SAMPConnection.close();
		}*/
		SAMPConnection = undefined;
		UI.VOMode('off');
		UI.clearClientList();
	}

	function onConnect( connection ) {
		SAMPConnection = connection;
		declareMetadata();
		ClientTracker = new samp.ClientTracker();
		ClientTracker.onchange = UI.updateClientList;
		ClientTracker.init( connection );
		SAMPConnection.setCallable( ClientTracker, function() { SAMPConnection.declareSubscriptions([{'*':{}}]) } );
		//DBG isHubOnlineInterval = setInterval(function() {samp.ping( onHubCheck );}, 3000);
		session.set( 'PrivateKey', SAMPConnection.regInfo['samp.private-key'] );
		UI.VOMode('on');
	}

	function onHubCheck( result ) {
		if ( ! result ) {
			disconnect();
			clearInterval( isHubOnlineInterval );
		}
	}

	function declareMetadata() {
		SAMPConnection.declareMetadata([{
			'samp.name': 'AstroTools',
			'samp.description': 'Simple toolbox',
			'samp.icon.url': location.href + '/img/icon.png'
		}], noop, onError );
	}

	function onConnectionError( e ) {
		if ( e.faultCode == 1 ) {
			alert('Unable to connect to hub.');
			UI.VOMode('off');
			return;
		}
		// launch defined samp hub through jnlp
		$('<iframe>', {src: defaultHubUrl, style: 'width:0; height:0;'}).appendTo('body');
		waitingForHub = setInterval(function() {samp.ping( onPingResult );}, 5000);
	}

	function onPingResult( pingResult ) {
		if ( pingResult == true ) {
			connect();
			clearInterval( waitingForHub );
		}
		else {
		//TODO append timeout handling?
		}
	}

	//TODO use web storage and fallback to cookies or server-side session
  var session = {
		// simple functions for cookies from http://www.w3schools.com/js/js_cookies.asp
		set: function( c_name, value, exdays ) {
			var exdate=new Date();
			exdate.setDate(exdate.getDate() + exdays);
			var c_value=escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
			document.cookie=c_name + "=" + c_value;
		},
		get: function ( c_name ) {
			var c_value = document.cookie;
			var c_start = c_value.indexOf(" " + c_name + "=");
			if (c_start == -1) {
				c_start = c_value.indexOf(c_name + "=");
			}
			if (c_start == -1) {
				c_value = null;
			}
			else {
				c_start = c_value.indexOf("=", c_start) + 1;
				var c_end = c_value.indexOf(";", c_start);
				if (c_end == -1) {
					c_end = c_value.length;
				}
				c_value = unescape(c_value.substring(c_start,c_end));
			}
			return c_value;
		}
  };

	return {
		init: init
	}
})();
$( AstroTools.init );
