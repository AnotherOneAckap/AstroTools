var AstroTools = (function() {
	var
		SAMPConnection,
		waitingForHubInterval,
		isHubOnlineInterval,
		defaultHubUrl = 'topcat-lite.jnlp',
		appendToBody = true,
		iconUrl = 'img/icon.png',
		aladinScript = 'get Aladin(DSS2) #{coords} 15arcmin;sync;"UCAC3, #{name}" = get VizieR(UCAC3,allcolumns) #{coords} #{radius}arcmin;sync;set "UCAC3, #{name}" shape=triangle color=red',
		table,
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

	// BEGIN UI class
	function UI ( params ) {

		this.clientNames = {};

		this.showBroadcastTableButton = function ( table ) {
			$('#astrotools-ui-container .button-rebroadcast-table').on( 'click', function () {
				table.broadcast();
			});
			$('#astrotools-ui-container .button-rebroadcast-table .table-name').text( table.name );
			$('#astrotools-ui-container .button-rebroadcast-table').show();
		};

		this.hideBroadcastTableButton = function () {
			$('#astrotools-ui-container .button-rebroadcast-table').hide();
		};

		this.VOMode = function ( mode ) {
			var state = 'disconnected';
			switch ( mode ) {

				case 'connected':
					$('#astrotools-ui-container .vo-mode-indicator').text('on');
					$('#astrotools-ui-container .vo-mode-switcher')
						.text('off')
						.off('click')
						.on( 'click', params.disconnectCallback )
						.removeAttr('disabled');
					state = mode;
					break;

				case 'connecting':
					$('#astrotools-ui-container .vo-mode-indicator').text('connecting');
					$('#astrotools-ui-container .vo-mode-switcher')
						.text('off')
						.off('click')
						.on( 'click', params.disconnectCallback )
						.removeAttr('disabled');
					state = mode;
					break;

				case 'disconnected':
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
	
		var that = this;
		this.onClientListChange = function ( id, type, data ) {
			var core = this;
			var
				$clientList = $('#astrotools-client-list');

			that.clientNames = {};
			$clientList.html('');

			$.each( core.clientTracker.metas, function( id, meta ) {
				if ( meta['samp.name'] ) that.clientNames[ meta['samp.name'].toLowerCase() ] = 1;
				if ( meta['samp.name'] && id != 'hub' && meta['samp.name'] != 'AstroTools' ) {
					$clientList.append(
						 $('<li>', { text: meta['samp.name'], title: meta['samp.description.text'] } ).prepend( $('<img>', { src: meta['samp.icon.url'] } ) )
					);
				}
			});
			that.updateVOMenu();
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

	}
	// END UI class

	function init ( options ) {
		if ( AstroTools.isStarted ) return undefined;
		
		var
			tableOptions,
			session = new Session(),
			core = new Core();

		core.session = session;

		if ( options instanceof Object ) {
			appendToBody  = options['appendToBody'] === false ? false : true;
			defaultHubUrl = options['defaultHubUrl'] || defaultHubUrl;
			iconUrl       = options['iconUrl']       || iconUrl;
			tableOptions  = options['tableOptions']  || {};
			aladinScript  = options['aladinScript']  || aladinScript;
			VOMenu        = options['VOMenu']        || VOMenu;
		}

		ui = new UI({
			initState: !!core.state,
			appendToBody: appendToBody,
			connectCallback: function () { session.set( 'at-vo-mode', 1 ); core.connect(); },
			disconnectCallback: function () { session.set( 'at-vo-mode', 0 ); core.disconnect(); }
		});

		if ( options.tableId && $( '#' + options.tableId ).length ) {
			core.callbacks.onStateChange.push( function ( newState, oldState ) {
				if ( newState == 'connected' ) {
					tableOptions['clientTracker'] = this.clientTracker;
					table = new Table( options.tableId, tableOptions );
					table.makeSortable();

					table.SAMPConnection = this.connection;
					table.enableCoordinatesHandler();
					table.enableRowHighlighting();
					var broadcastedTables = JSON.parse( this.session.getBroadcastedTables() ) || {};
					if ( ! broadcastedTables[ table.id ] ) {
						table.broadcast();
						broadcastedTables[table.id] = 1;
						this.session.setBroadcastedTables( JSON.stringify(broadcastedTables) );
					}
					ui.showBroadcastTableButton( table );
				}
				else {
					ui.hideBroadcastTableButton();
				}
			});
		}

		core.callbacks.onStateChange.push( function ( newState, oldState ) {
			ui.VOMode( newState );
			if ( newState == 'connected' ) {
				makeLinksBroadcastable( this.connection );
			}
		});
		core.callbacks.onClientListChange.push( ui.onClientListChange );
		// if we store private-key on cookies we no need anymore to disconnect on unload
		// $(window).unload( disconnect );

		if ( session.getVOMode() == 1 ) core.connect();
		
		AstroTools.isStarted = true;
	}

	function makeLinksBroadcastable( SAMPConnection ) {
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

	// BEGIN Core class 
	function Core () {
		this.callbacks = {
			onStateChange: [],
			onClientListChange: []
		};
		this.state = 'disconnected';
	}

	Core.prototype.connect = function () {
		this.changeState('connecting');
		var pk = this.session.getPrivateKey();
		if ( pk && pk != undefined ) {
			this.setConnection( new samp.Connection({ 'samp.private-key': pk }) );
			return true;
		}
		samp.register( 'AstroTools', this.setConnection.bind(this), onConnectionError.bind(this) );
	};

	Core.prototype.disconnect = function () {
		var that = this;
		if ( that.connection ) {
			that.connection.close();
			that.session.setPrivateKey( '' );
		}
		if ( table ) {
			table.disableRowHighlighting();
			table.disableCoordinatesHandler();
		}
		that.connection = undefined;
		that.changeState('disconnected');
		if ( isHubOnlineInterval ) clearInterval( isHubOnlineInterval );
		if ( waitingForHubInterval ) clearInterval( waitingForHubInterval );
	};

	Core.prototype.changeState = function ( newState ) {
		var that = this;
		$.each( that.callbacks.onStateChange, function ( i, callback ) {
			callback.call( that, newState, that.state );
		});
		that.state = newState;
	};

	Core.prototype.setConnection = function ( connection ) {
		var that = this;
		that.connection = connection;

		that.connection.declareMetadata([{
			'samp.name': 'AstroTools',
			'samp.description.text': 'Simple toolbox',
			'samp.icon.url': Utils.absolutizeURL( iconUrl ),
			'home.page': 'https://github.com/AnotherOneAckap/AstroTools',
			'author.name': 'Askar Timirgazin, Ivan Zolotukhin',
			'author.email': 'anotheroneackap@gmail.com'
		}], jQuery.noop, that.disconnect.bind(that) );

		that.clientTracker = new samp.ClientTracker();
		that.clientTracker.onchange = function (id, type, data) {
			$.each( that.callbacks.onClientListChange, function ( i, callback ) {
				callback.call( that, id, type, data );
			});
		};

		that.clientTracker.init( connection );

		that.connection.setCallable( that.clientTracker, function () { that.connection.declareSubscriptions([{'*':{}}]) } );

		isHubOnlineInterval = setInterval( function () {
			samp.ping( function ( result ) {
				if ( ! result ) that.disconnect()
			})
		}, 3000 );

		that.session.setPrivateKey( that.connection.regInfo['samp.private-key'] );

		that.changeState('connected');
	};

	function onConnectionError( e ) {
		var that = this;
		if ( e.faultCode == 1 ) {
			alert('Unable to connect to hub.');
			that.changeState('disconnected');
			return;
		}
		// launch defined samp hub through jnlp
		document.location = Utils.absolutizeURL( defaultHubUrl );
		waitingForHubInterval = setInterval( function () { samp.ping( onPingResult ); }, 5000);

		function onPingResult( pingResult ) {
			if ( pingResult == true ) {
				that.connect();
				clearInterval( waitingForHubInterval );
			}
			else {
			//TODO append timeout handling?
			}
		}
	}
	// END Core class 

	//TODO use web storage and fallback to cookies or server-side session
	// BEGIN Session class 
	function Session () {};

	// simple functions for cookies from http://www.w3schools.com/js/js_cookies.asp
	Session.prototype.set = function( c_name, value, exdays ) {
		var exdate=new Date();
		exdate.setDate(exdate.getDate() + exdays);
		var c_value=escape(value) + "; path=/;" + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
		document.cookie=c_name + "=" + c_value;
	};

	Session.prototype.get = function ( c_name ) {
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
	};


	Session.prototype.getPrivateKey = function () {
			return this.get('at-private-key');
	};

	Session.prototype.getBroadcastedTables = function () {
		return this.get('at-table-broadcasted');
	};

	Session.prototype.setBroadcastedTables = function ( value ) {
		return this.set( 'at-table-broadcasted', value );
	};

	Session.prototype.setPrivateKey = function ( key ) {
		return this.set( 'at-private-key', key );
	};

	Session.prototype.getVOMode = function () {
		return this.get('at-vo-mode');
	};

	// END Session class 

	// BEGIN Table class
	function Table( tableId, options ) {
		var $table = $( document.getElementById(tableId) );
		if ( ! $table.length ) return;
		this.$table = $table;
		this.id   = $table.attr('data-vo-table-id');
		this.name = $table.attr('data-vo-table-name');
		this.url  = Utils.absolutizeURL( $table.attr('data-vo-table-url') );

		if ( options instanceof Object ) {
			if ( options['sortIcon'] instanceof Object  ) {
				this.sortIcon.asc = options['sortIcon']['asc'] || this.sortIcon.asc;
				this.sortIcon.desc = options['sortIcon']['desc'] ||this.sortIcon.desc;
			}
			if ( options['clientTracker'] ) {
				this.clientTracker = options['clientTracker'];
			}
		}

		return this;
	}

	Table.prototype.sortIcon = { 'asc': '&#9650;', 'desc': '&#9660;' };
	Table.prototype.errorHandler = function ( error ) { if ( window.console ) console.error( error ) };

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
		  	that.SAMPConnection.notifyAll( [message], jQuery.noop, that.errorHandler );

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
		  	that.SAMPConnection.notifyAll( [message], jQuery.noop, that.errorHandler );
		});
	}

	Table.prototype.disableRowHighlighting = function() {
		this.$table.off( 'mouseover', 'tbody tr' );
		this.$table.off( 'mouseout',  'tbody tr' );
		if ( this.clientTracker ) delete this.clientTracker.callHandler['table.highlight.row'];
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
		this.clientTracker.callHandler['table.highlight.row'] = function(senderId, message, isCall) {
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
	// END Table class

	return {
		init: init,
		Table: Table,
		Core: Core,
		Utils: Utils,
		Session: Session,
		VOMenu: VOMenu
	}
})();
