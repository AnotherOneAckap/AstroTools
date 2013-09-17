var AstroTools = (function() {
	var SAMPConnection;
	var ClientTracker;
	var waitingForHub;
	var isHubOnlineInterval;
	var defaultHubUrl = 'http://www.starlink.ac.uk/topcat/topcat-lite.jnlp';
	var iconUrl = 'img/icon.png';
	var table;

	var UI = {
		init: function() {
			$('body').append('<div id="astrotools-ui-container"><span class="vo-mode-indicator"></span><button class="vo-mode-switcher"></button><button class="button-rebroadcast-table">Re-broadcast table "<span class="table-name"></span>"</button><ul id="astrotools-client-list"></ul></div>');
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
						.on( 'click', function() { session.set('at-vo-mode', '0'); disconnect(); } )
						.removeAttr('disabled');
					if ( table ) {
						$('#astrotools-ui-container .button-rebroadcast-table').on('click', function() {
							table.broadcast();
						});
						$('#astrotools-ui-container .button-rebroadcast-table .table-name').text(table.name);
						$('#astrotools-ui-container .button-rebroadcast-table').show();
					}
					break;
				case 'connecting':
					$('#astrotools-ui-container .button-rebroadcast-table').hide();
					$('#astrotools-ui-container .vo-mode-indicator').text('connecting');
					$('#astrotools-ui-container .vo-mode-switcher')
						.text('off')
						.off('click')
						.on( 'click', function() { session.set('at-vo-mode', '0'); disconnect(); } )
						.removeAttr('disabled');
					break;
				case 'off':
					$('#astrotools-ui-container .vo-mode-indicator').text('off')
					$('#astrotools-ui-container .vo-mode-switcher')
						.text('on')
						.off('click')
						.on( 'click', function() { session.set('at-vo-mode', '1'); connect(); } )
						.removeAttr('disabled');
					$('#astrotools-ui-container .button-rebroadcast-table').hide();
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
		
		var tableOptions;
		if ( options instanceof Object ) {
			defaultHubUrl = options['defaultHubUrl'] || defaultHubUrl;
			iconUrl       = options['iconUrl']       || iconUrl;
			tableOptions  = options['tableOptions']  || {};
		}

		UI.init();
		// if we store private-key on cookies we no need anymore to disconnect on unload
		// $(window).unload( disconnect );

		makeLinksBroadcastable();

		if ( this.tableId && $('#'+this.tableId).length ) {
			table = new Table( this.tableId, tableOptions );
			AstroTools.table = table;
			table.makeSortable();
		}

		//NB can we check session for previous connection and re-use it?
		if ( session.get('at-vo-mode') == 1 ) connect();
		
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
				var params = {'url': absolutizeURL( $link.attr('href') ) };
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
		UI.VOMode('connecting');
		var pk = session.get('at-private-key');
		if ( pk && pk != undefined ) {
			onConnect( new samp.Connection({ 'samp.private-key': pk }) );
			return;
		}
		samp.register( 'AstroTools', onConnect, onConnectionError );
	}

	function onError() {
		SAMPConnection.close;
		session.set( 'at-private-key', '' );
		UI.VOMode('off');
		UI.clearClientList();
	}

	function noop() {	}

	function disconnect() {
		if ( SAMPConnection ) {
			SAMPConnection.close();
			session.set( 'at-private-key', '' );
		}
		if ( table ) {
			table.disableRowHighlighting();
			table.disableCoordinatesHandler();
		}
		SAMPConnection = undefined;
		UI.clearClientList();
		UI.VOMode('off');
	}

	function onConnect( connection ) {
		SAMPConnection = connection;
		declareMetadata();
		ClientTracker = new samp.ClientTracker();
		ClientTracker.onchange = UI.updateClientList;
		ClientTracker.init( connection );
		SAMPConnection.setCallable( ClientTracker, function() { SAMPConnection.declareSubscriptions([{'*':{}}]) } );
		isHubOnlineInterval = setInterval(function() {samp.ping( onHubCheck );}, 3000);
		session.set( 'at-private-key', SAMPConnection.regInfo['samp.private-key'] );

		if ( table ) {
			table.SAMPConnection = SAMPConnection;
			table.enableCoordinatesHandler();
			table.enableRowHighlighting();
			var broadcastedTables = JSON.parse( session.get('at-table-broadcasted') ) || {};
			if ( ! broadcastedTables[ table.id ] ) {
				table.broadcast();
				broadcastedTables[table.id] = 1;
				session.set( 'at-table-broadcasted', JSON.stringify(broadcastedTables) );
			}
		}
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
			'samp.icon.url': absolutizeURL( iconUrl )
		}], noop, onError );
	}

	function onConnectionError( e ) {
		if ( e.faultCode == 1 ) {
			alert('Unable to connect to hub.');
			UI.VOMode('off');
			return;
		}
		// launch defined samp hub through jnlp
		$('<iframe>', {frameborder: 0,src: absolutizeURL( defaultHubUrl ), style: 'width:0; height:0;'}).appendTo('body');
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

	// Table class
	function Table( tableId, options ) {
		var $table = $( document.getElementById(tableId) );
		if ( ! $table.length ) return;
		this.$table = $table;
		this.id   = $table.attr('data-vo-table-id');
		this.name = $table.attr('data-vo-table-name');
		this.url  = absolutizeURL( $table.attr('data-vo-table-url') );

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
				aladinScript = 'get Aladin(DSS2) #{coords} 15arcmin;sync;"UCAC3, #{name}" = get VizieR(UCAC3,allcolumns) #{coords} #{radius}arcmin;sync;set "UCAC3, #{name}" shape=triangle color=red',
				message;
			
			// sending to Aladin
			aladinScript = aladinScript.replace( /#{coords}/g, $row.attr('data-coords') )
				.replace(/#{name}/g,   $row.attr('data-name')   )
				.replace(/#{radius}/g, $row.attr('data-radius') );
			message = new samp.Message('script.aladin.send', {
					'script': aladinScript
			});
	  	if ( that.SAMPConnection instanceof samp.Connection && ! that.SAMPConnection.closed ) 
		  	that.SAMPConnection.notifyAll([message]);

			// sending to others
      var
				coords = $row.attr('data-coords').split(' '),
      	ra  = sexaToDec(coords[0]),
      	dec = sexaToDec(coords[1]);
			message = new samp.Message('coords.pointAt.sky', {
				'ra': ra.toString(),
				'dec': dec.toString()
			});
	  	if ( that.SAMPConnection instanceof samp.Connection && ! that.SAMPConnection.closed ) 
		  	that.SAMPConnection.notifyAll([message]);
		});
	}

	Table.prototype.disableRowHighlighting = function() {
		this.$table.off( 'mouseover', 'tbody tr' );
		this.$table.off( 'mouseout',  'tbody tr' );
		delete ClientTracker.callHandler['table.highlight.row'];
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
			return a-b;
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

	function absolutizeURL( url ) {
		// url may be already full
		// url may be path relative host root (href="/foo")
		// else it's path relative current location (href="bar")
		return url.substr(0,4) == 'http' ?	url :  url.substr(0,1) == '/' ? location.protocol + '//' + location.host + url :   location.href.replace(/\/+[^/]+$/,'/') + url;
	}

  function sexaToDec(sexa) {
    var parts = sexa.split(':');
    return 3600 * parts[0] + 60 * parts[1] + 1 * parts[2];
  }

	return {
		init: init,
		Table: Table,
		Utils: { 'absolutizeURL': absolutizeURL, 'sexaToDec': sexaToDec },
		ClientTracker: ClientTracker
	}
})();
