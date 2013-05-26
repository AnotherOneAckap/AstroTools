var AstroTools = (function() {
	var SAMPConnection;
	var ClientTracker;
	var waitingForHub;
	var defaultHubUrl = 'http://www.starlink.ac.uk/topcat/topcat-lite.jnlp';

	var UI = {
		init: function() {
			$('body').append('<div id="astrotools-ui-container"><div class="vo-mode-indicator"></div><button class="vo-mode-switcher"></button></div>');
			$('body').append('<ul id="astrotools-client-list">');
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
				  	.click( disconnect )
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
				  	.click( connect )
				  	.removeAttr('disabled');
			    break;
			}
		},
		updateClientList: function() {
			$('#astrotools-client-list').html('');
			$.each( ClientTracker.metas, function( id, meta ) {
				$('#astrotools-client-list').append( $('<li>', { text: meta['samp.name'] } ) );
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
		$(window).unload( disconnect );
		//NB can we check seesion for previous connection and re-use it?
		//if ( session.VOMode == 'on' ) connect();
		connect();
		
		AstroTools.isStarted = true;
	}

	function connect() {
		UI.VOMode('connecting');
		samp.register( 'AstroTools', onConnect, onConnectionError );
	}

	function disconnect() {
		if ( SAMPConnection ) {
			SAMPConnection.close();
		}
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
		UI.VOMode('on');
	}

	function declareMetadata() {
		SAMPConnection.declareMetadata([{ 'samp.name': 'AstroTools', 'samp.description': 'Simple toolbox' }]);
	}

	function onConnectionError( e ) {
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

	// simple functions for cookies from http://www.w3schools.com/js/js_cookies.asp
	function setCookie( c_name, value, exdays ) {
		var exdate=new Date();
		exdate.setDate(exdate.getDate() + exdays);
		var c_value=escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
		document.cookie=c_name + "=" + c_value;
	}

	function getCookie( c_name ) {
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

  var cookie = {
    pwscOn: function(){ return document.cookie.match(/\bPWSC=1\b/) },
    set: function(){ document.cookie = 'PWSC=1;path=/' },
    unset: function(){document.cookie = 'PWSC=0;path=/' },
    hasTableId: function(id) { return $A(this.getTables()).include(id); },
    addTableId: function(id) { document.cookie = 'PWSCTables=' + this.getTables().concat(id).join('|') + ';path=/'; },
    getTables: function(id) {
      var match = document.cookie.match(/\bPWSCTables=(.*?)(;|$)/);
      if (!match) return [];
      return match[1].split('|');
    }
  };

	return {
		init: init
	}
})();
$( AstroTools.init );
