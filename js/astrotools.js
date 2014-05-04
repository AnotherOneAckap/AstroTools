var AstroTools = (function() {
	var
		SAMPConnection,
		ClientTracker,
		waitingForHubInterval,
		isHubOnlineInterval,
		defaultHubUrl = 'topcat-lite.jnlp',
		appendToBody = true,
		iconUrl = 'img/icon.png',
		aladinScript = 'get Aladin(DSS2) #{coords} 15arcmin;sync;"UCAC3, #{name}" = get VizieR(UCAC3,allcolumns) #{coords} #{radius}arcmin;sync;set "UCAC3, #{name}" shape=triangle color=red',
		table,
		_ui,
		VOMenu = [
			{ name: 'aladin', title: 'launch Aladin', link: 'http://aladin.u-strasbg.fr/java/nph-aladin.pl?frame=get&id=AladinBeta.jnlp' },
			{ name: 'topcat', title: 'launch Topcat', link: 'http://andromeda.star.bris.ac.uk/~mbt/topcat/topcat-full.jnlp' }
		];

	var Utils = {
		absolutizeURL: function ( url ) {
			// url may be already full
			// url may be path relative host root (href="/foo")
			// else it's path relative current location (href="bar")
			return url.substr(0,4) == 'http' ?	url :  url.substr(0,1) == '/' ? location.protocol + '//' + location.host + url :   location.href.replace(/\/+[^/]+$/,'/') + url;
		},
		sexaToDec: function ( sexa ) {
			var parts = sexa.split(':');
			return 3600 * parts[0] + 60 * parts[1] + 1 * parts[2];
		}
	};

	var UI = function ( params ) {

		this.clientNames = {};

		this.VOMode = function ( mode ) {
			var state = 'off';
			switch ( mode ) {

				case 'on':
					$('#astrotools-ui-container .vo-mode-indicator').text('on');
					$('#astrotools-ui-container .vo-mode-switcher')
						.text('off')
						.off('click')
						.on( 'click', params.disconnectCallback )
						.removeAttr('disabled');
					if ( params.table ) {
						$('#astrotools-ui-container .button-rebroadcast-table').on( 'click', function () {
							params.table.broadcast();
						});
						$('#astrotools-ui-container .button-rebroadcast-table .table-name').text( params.table.name );
						$('#astrotools-ui-container .button-rebroadcast-table').show();
					}
					state = mode;
					break;

				case 'connecting':
					$('#astrotools-ui-container .button-rebroadcast-table').hide();
					$('#astrotools-ui-container .vo-mode-indicator').text('connecting');
					$('#astrotools-ui-container .vo-mode-switcher')
						.text('off')
						.off('click')
						.on( 'click', params.disconnectCallback )
						.removeAttr('disabled');
					state = mode;
					break;

				case 'off':
					$('#astrotools-ui-container .vo-mode-indicator').text('off')
					$('#astrotools-ui-container .vo-mode-switcher')
						.text('on')
						.off('click')
						.on( 'click', params.connectCallback )
						.removeAttr('disabled');
					$('#astrotools-ui-container .button-rebroadcast-table').hide();
					state = mode;
					break;

				default:
					return state;
			}
		};
	
		this.updateClientList = function () {
			var
				$clientList = $('#astrotools-client-list');

			this.clientNames = {};
			var clientNames = this.clientNames;
			$clientList.html('');
			$.each( ClientTracker.metas, function( id, meta ) {
				if ( meta['samp.name'] ) clientNames[ meta['samp.name'].toLowerCase() ] = 1;
				if ( meta['samp.name'] && id != 'hub' && meta['samp.name'] != 'AstroTools' ) {
					$clientList.append(
						 $('<li>', { text: meta['samp.name'], title: meta['samp.description.text'] } ).prepend( $('<img>', { src: meta['samp.icon.url'] } ) )
					);
				}
			});
			this.updateVOMenu();
		};

		this.clearClientList = function () {
			$('#astrotools-client-list').html('');
		};

		this.updateVOMenu = function () {
			var
				$VOMenu = $('#astrotools-vo-menu');

			$VOMenu.html('');
			$.each( VOMenu, function( k, item ) {
				if ( this.clientNames && this.clientNames[ item.name ] ) return;
				var
					$link = $('<a>', { href: "javascript:window.location='"+item.link+"'", text: item.title } ),
					$li = $('<li>').prepend( $link );
				$li.on( 'click', function() {
					var $that = $(this);
					$that.html('Waiting...'); 
					setTimeout( function() { $that.html( $link ) }, 5000 );
				});
				$VOMenu.append(	$li );
			});
		};

		if ( params.appendToBody ) {
			$('body').append('<div id="astrotools-ui-container"><span class="vo-mode-indicator"></span><button class="vo-mode-switcher"></button><button class="button-rebroadcast-table">Re-broadcast table "<span class="table-name"></span>"</button><ul id="astrotools-client-list"></ul><ul id="astrotools-vo-menu"></ul></div>');
		};
		this.updateVOMenu();
		if ( params.initState ) {
			this.VOMode('on');
		}
		else {
			this.VOMode('off');
		}

	};

	function init ( options ) {
		if ( AstroTools.isStarted ) return undefined;
		
		var tableOptions;
		if ( options instanceof Object ) {
			appendToBody  = options['appendToBody'] === false ? false : true;
			defaultHubUrl = options['defaultHubUrl'] || defaultHubUrl;
			iconUrl       = options['iconUrl']       || iconUrl;
			tableOptions  = options['tableOptions']  || {};
			aladinScript  = options['aladinScript']  || aladinScript;
			VOMenu        = options['VOMenu']        || VOMenu;
		}

		if ( this.tableId && $('#'+this.tableId).length ) {
			table = new Table( this.tableId, tableOptions );
			AstroTools.table = table;
			table.makeSortable();
		}

		_ui = new UI({
			initState: !!SAMPConnection,
			table: table,
			appendToBody: appendToBody,
			connectCallback: function () { Session.set( 'at-vo-mode', 1 ); connect(); },
			disconnectCallback: function () { Session.set( 'at-vo-mode', 0 ); disconnect(); }
		});
		// if we store private-key on cookies we no need anymore to disconnect on unload
		// $(window).unload( disconnect );

		makeLinksBroadcastable();

		//NB can we check session for previous connection and re-use it?
		if ( Session.get('at-vo-mode') == 1 ) connect();
		
		AstroTools.isStarted = true;
	}

	function makeLinksBroadcastable() {
		$('.at-table-link').on( 'mouseover', function() {
			if ( ! SAMPConnection || SAMPConnection.closed ) return;
			var $link = $(this);
			if ( $link.next('.vo-broadcast-button').length ) return;
			var $button = $('<button>', { 'type': 'button', 'text': 'Broadcast', 'class': 'vo-broadcast-button' });
			$link.after($button);
			$button.on('click', function() {
				var params = {'url': Utils.absolutizeURL( $link.attr('href') ) };
				if ( $link.attr('data-vo-table-id') ) params['table-id'] = $link.attr('data-vo-table-id');
				if ( $link.attr('data-vo-table-name') ) params['name'] = $link.attr('data-vo-table-name');

      	var message = new samp.Message('table.load.votable', params);
	      SAMPConnection.notifyAll([message]);
			});
		});

		$('.at-table-link').on( 'mouseout', function(e) {
			var $button = $(this).next('.vo-broadcast-button');
			if ( $(e.relatedTarget) == $button ) {
			    return false;
			}
			else {
			    setTimeout( function() { $button.remove(); }, 3000 );
			}
		});
	}

	function connect() {
		_ui.VOMode('connecting');
		var pk = getPrivateKey();
		if ( pk && pk != undefined ) {
			onConnect( new samp.Connection({ 'samp.private-key': pk }) );
			return;
		}
		samp.register( 'AstroTools', onConnect, onConnectionError );
	}

	function onError() {
		SAMPConnection.close;
		setPrivateKey( '' );
		_ui.VOMode('off');
		_ui.clearClientList();
	}

	function noop() {	}
	function errorHandler( error ) { if ( window.console ) console.error( error ) }

	function disconnect() {
		if ( SAMPConnection ) {
			SAMPConnection.close();
			setPrivateKey( '' );
		}
		if ( table ) {
			table.disableRowHighlighting();
			table.disableCoordinatesHandler();
		}
		SAMPConnection = undefined;
		_ui.clearClientList();
		_ui.VOMode('off');
		if ( isHubOnlineInterval ) clearInterval( isHubOnlineInterval );
		if ( waitingForHubInterval ) clearInterval( waitingForHubInterval );
	}

	function onConnect( connection ) {
		SAMPConnection = connection;
		declareMetadata();
		ClientTracker = new samp.ClientTracker();
		ClientTracker.onchange = _ui.updateClientList.bind( _ui );//TODO possible IE<9 problem
		ClientTracker.init( connection );
		SAMPConnection.setCallable( ClientTracker, function() { SAMPConnection.declareSubscriptions([{'*':{}}]) } );
		isHubOnlineInterval = setInterval(function() {samp.ping( onHubCheck );}, 3000);
		setPrivateKey( SAMPConnection.regInfo['samp.private-key'] );

		if ( table ) {
			table.SAMPConnection = SAMPConnection;
			table.enableCoordinatesHandler();
			table.enableRowHighlighting();
			var broadcastedTables = JSON.parse( Session.get('at-table-broadcasted') ) || {};
			if ( ! broadcastedTables[ table.id ] ) {
				table.broadcast();
				broadcastedTables[table.id] = 1;
				Session.set( 'at-table-broadcasted', JSON.stringify(broadcastedTables) );
			}
		}
		_ui.VOMode('on');
	}

	function onHubCheck( result ) {
		if ( ! result ) disconnect()
	}

	function declareMetadata() {
		SAMPConnection.declareMetadata([{
			'samp.name': 'AstroTools',
			'samp.description.text': 'Simple toolbox',
			'samp.icon.url': Utils.absolutizeURL( iconUrl ),
			'home.page': 'https://github.com/AnotherOneAckap/AstroTools',
			'author.name': 'Askar Timirgazin, Ivan Zolotukhin',
			'author.email': 'anotheroneackap@gmail.com'
		}], noop, onError );
	}

	function onConnectionError( e ) {
		if ( e.faultCode == 1 ) {
			alert('Unable to connect to hub.');
			_ui.VOMode('off');
			return;
		}
		// launch defined samp hub through jnlp
		document.location = Utils.absolutizeURL( defaultHubUrl );
		waitingForHubInterval = setInterval(function() {samp.ping( onPingResult );}, 5000);
	}

	function onPingResult( pingResult ) {
		if ( pingResult == true ) {
			connect();
			clearInterval( waitingForHubInterval );
		}
		else {
		//TODO append timeout handling?
		}
	}

	//TODO use web storage and fallback to cookies or server-side session
  var Session = {
		// simple functions for cookies from http://www.w3schools.com/js/js_cookies.asp
		set: function( c_name, value, exdays ) {
			var exdate=new Date();
			exdate.setDate(exdate.getDate() + exdays);
			var c_value=escape(value) + "; path=/;" + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
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

	function getPrivateKey () {
		return Session.get('at-private-key');
	}

	function setPrivateKey ( key ) {
		return Session.set( 'at-private-key', key );
	}

	// Table class
	function Table( tableId, options ) {
		var $table = $( document.getElementById(tableId) );
		if ( ! $table.length ) return;
		this.$table = $table;
		this.id   = $table.attr('data-vo-table-id');
		this.name = $table.attr('data-vo-table-name');
		this.url  = Utils.absolutizeURL( $table.attr('data-vo-table-url') );

		if ( options instanceof Object ) {
			this.sortIcon.asc = options['sortIcon']['asc'] || this.sortIcon.asc;
			this.sortIcon.desc = options['sortIcon']['desc'] ||this.sortIcon.desc;
		}

		return this;
	}

	Table.prototype.sortIcon = { 'asc': '&#9650;', 'desc': '&#9660;' };

	Table.prototype.disableCoordinatesHandler = function() {
		this.$table.off('click', '.at-table-cell-coords');
		this.$table.find('.at-table-cell-coords').removeClass('at-table-cell-coords');
	}

	Table.prototype.enableCoordinatesHandler = function() {
		// coordinate columns init
		var
			$table = this.$table,
			that = this;

		$table.find('col.coords').each( function() {
			var i = $(this).index();
			$table.find('tr').find('td:nth('+i+')').addClass('at-table-cell-coords');
		});

		$table.on('click', '.at-table-cell-coords', function() {
			var
				$row = $(this).parent(),
				script,
				message;
			
			// sending to Aladin
			// possible feature: allow any placeholder and replace it with appropriate data- attr
			script = aladinScript.replace( /#{coords}/g, $row.attr('data-coords') )
				.replace(/#{name}/g,   $row.attr('data-name')   )
				.replace(/#{radius}/g, $row.attr('data-radius') );
			message = new samp.Message('script.aladin.send', {
					'script': script
			});
	  	if ( that.SAMPConnection instanceof samp.Connection && ! that.SAMPConnection.closed ) 
		  	that.SAMPConnection.notifyAll( [message], noop, errorHandler );

			// sending to others
      var
				coords = $row.attr('data-coords').split(' '),
      	ra  = coords[0],
      	dec = coords[1];
			message = new samp.Message('coord.pointAt.sky', {
				'ra': ra.toString(),
				'dec': dec.toString()
			});
	  	if ( that.SAMPConnection instanceof samp.Connection && ! that.SAMPConnection.closed ) 
		  	that.SAMPConnection.notifyAll( [message], noop, errorHandler );
		});
	}

	Table.prototype.disableRowHighlighting = function() {
		this.$table.off( 'mouseover', 'tbody tr' );
		this.$table.off( 'mouseout',  'tbody tr' );
		if ( ClientTracker ) delete ClientTracker.callHandler['table.highlight.row'];
	}

	Table.prototype.enableRowHighlighting = function() {
		var that = this;
		// table row highlighting send
		that.$table.on( 'mouseover', 'tbody tr', function() {
			$(this).addClass('at-table-row-highlighted');
			var message = new samp.Message('table.highlight.row', {
				'table-id': that.id,
				'url': that.url,
				'row': this.getAttribute('data-index').toString()
			});
	  	if ( that.SAMPConnection instanceof samp.Connection && ! that.SAMPConnection.closed ) 
		  	that.SAMPConnection.notifyAll([message]);
		});

		that.$table.on( 'mouseout', 'tbody tr', function() {
			$(this).removeClass('at-table-row-highlighted');
		});

		// table row highlighting receive
		ClientTracker.callHandler['table.highlight.row'] = function(senderId, message, isCall) {
			var $row = that.$table.find('tr[data-index="' + message['samp.params']['row'] +'"]');
			that.$table.find('.at-table-row-highlighted').removeClass('at-table-row-highlighted');
			$row.addClass('at-table-row-highlighted');
			window.scrollTo( 0, $row.position().top );
		};
	}

	Table.prototype.makeSortable = function() {
		var that = this;
		that.$table.find('thead th').css('cursor', 'pointer');
		that.$table.on('click', 'thead th', function() {
			var
				$rows = that.$table.find('tbody tr'),
				cellIndex = $(this).index(),
				rowSorters = {};
			
			// if column is already sorted just reverse it
			if ( $(this).hasClass('at-table-column-sorted') ) {
				that.$table.append( $rows.detach().toArray().reverse() );
				$(this).find('.at-sort-icon').toggle();
			}
			else {
				that.$table.find('thead th.at-table-column-sorted')
					.removeClass('at-table-column-sorted')
					.find('.at-sort-icon').remove();
				var sorter = that.rowSorters[this.getAttribute('data-type')||'numerical']( cellIndex );
				that.$table.append( $rows.detach().toArray().sort( sorter ) );
				$(this).addClass('at-table-column-sorted').append('<span class="at-sort-icon at-sort-icon-asc">&nbsp;' + that.sortIcon.asc + '&nbsp;</span><span class="at-sort-icon at-sort-icon-desc" style="display:none">&nbsp;' + that.sortIcon.desc + '&nbsp;</span>');
			}
		});
	};

	Table.prototype.rowSorters = {};

	Table.prototype.rowSorters['string'] = function( cellIndex ) {
		return function( rowA, rowB ) {
			var
				a = rowA.children[cellIndex].textContent.trim().toLowerCase(),
				b = rowB.children[cellIndex].textContent.trim().toLowerCase();
			if ( a > b ) return 1;
			if ( a < b ) return -1;
			if ( a == b ) return 0;
		}
	};

	Table.prototype.rowSorters['numerical'] = function( cellIndex ) {
		return function( rowA, rowB ) {
			var
				a = rowA.children[cellIndex].textContent,
				b = rowB.children[cellIndex].textContent;

			a = parseFloat( a ) || Number.NEGATIVE_INFINITY;
			b = parseFloat( b ) || Number.NEGATIVE_INFINITY;
			return a - b;
		}
	};

	Table.prototype.rowSorters['sexagesimal'] = function( cellIndex ) {
		return function( rowA, rowB ) {
			var
				a = rowA.children[cellIndex].textContent.trim().replace(/^([0-9])/, '+$1'),
				b = rowB.children[cellIndex].textContent.trim().replace(/^([0-9])/, '+$1'),
				firstA = a.substr(0,1),
				firstB = b.substr(0,1);
		 
			// because '+' < '-'
			if ( firstA < firstB ) return 1;
			if ( firstA > firstB ) return -1;
			if ( firstA == '+' ) {
				if ( a > b ) return 1;
				if ( a < b ) return -1;
				if ( a == b ) return 0;
			}
			// negative numbers
			else {
				if ( a > b ) return -1;
				if ( a < b ) return 1;
				if ( a == b ) return 0;
			}
		}
	}

	Table.prototype.rowSorters['astronomical-object-name'] = function( cellIndex ) {
		return function( rowA, rowB ) {
			var
				wordsA = rowA.children[cellIndex].textContent.split(/\s+/),
				wordsB = rowB.children[cellIndex].textContent.split(/\s+/),
				i = 0,
				result = undefined;

			while ( result == undefined ) {
				if ( wordsA[i] == undefined && wordsB[i] != undefined ) {
					result = -1;
				}
				if ( wordsB[i] == undefined && wordsA[i] != undefined ) {
					result = 1;
				}
				if ( wordsB[i] == undefined && wordsA[i] == undefined ) {
					result = 0;
				}
				if ( wordsA[i] == wordsB[i] ) {
					i++;
					continue;
				}
				// if current words are number, compare them
				if ( wordsA[i]-0 == wordsA[i] && wordsB[i]-0 == wordsB[i] ) {
					result = wordsA[i] - wordsB[i];
				}
				else {
					// else strings comparision
					if ( wordsA[i] > wordsB[i] ) result = 1;
					if ( wordsA[i] < wordsB[i] ) result = -1;
				}
			}

			return result;
		}
	};

	Table.prototype.broadcast = function() {
		// broadcast table to others
		var params = { 'url': this.url };
		if ( this.id   ) params['table-id'] = this.id;
		if ( this.name ) params['name']     = this.name;

    var message = new samp.Message('table.load.votable', params);
	  if ( this.SAMPConnection instanceof samp.Connection && ! this.SAMPConnection.closed ) 
			this.SAMPConnection.notifyAll([message]);
	}

	return {
		init: init,
		Table: Table,
		Utils: Utils,
		ClientTracker: ClientTracker,
		VOMenu: VOMenu
	}
})();
