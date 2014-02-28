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

And do not forget css file ( which you can customize )

	<head>
		...
		<link rel="stylesheet" href="css/astrotools.css" />
		...
	</head>

After document is loaded, you can configure and start Astrotools just like this

	<script type="text/javascript">
		$( function() {
			AstroTools.tableId = 'data';
			AstroTools.init();
		});
	</script>


Startup options
===============

You can pass options object to initialization function:

	AstroTools.init({ iconUrl: '/media/images/icon.png });

+ _iconUrl_ absolute or relative path to client icon to display in hub window
+ _defaultHubUrl_ absolute or relative path to default hub ( .jnlp file to load and launch )
+ _tableOptions_  object which passed to Table constructor options argument 
+ _VOMenu_  a list of launchers shown in AstroTools panel, default is

	[
    { name: 'aladin', title: 'launch Aladin', link: 'http://aladin.u-strasbg.fr/java/nph-aladin.pl?frame=get&id=aladin.jnlp' },
    { name: 'topcat', title: 'launch Topcat', link: 'http://andromeda.star.bris.ac.uk/~mbt/topcat/topcat-full.jnlp' }
	]

+ _aladinScript_  an aladin script which will be send by [coordinate cell handler](#coordinate-cell-handler), default is


	get Aladin(DSS2) #{coords} 15arcmin;sync;"UCAC3, #{name}" = get VizieR(UCAC3,allcolumns) #{coords} #{radius}arcmin;sync;set "UCAC3, #{name}" shape=triangle color=red

where #{coords}, #{name} and #{radius} are placeholders. IMPORTANT: To be able send scripts to aladin, you must use included in distribution jnlp file as default hub. JSAMP hub used in Topcat restricts by default unknown MTypes, so it is necessary to run it with -web:norestrictmtypes key.

e.g. customizing table headings sort icons

	var tOptions = { sortIcon: { asc: '<img src="up.png"/>', desc: '<img src="down.png"/>' } };
	AstroTools.init({ tableOptions: tOptions })


Features
========

Table class
-----------

	var t = new AstroTools.Table( tableId, options )

makes possible to add sorting, row highlighting and point at coordinates through SAMP connection.

Options
-------

+ _sortIcon_ Object with keys _asc_ and _desc_, used for indicate sorting in table headings.

For example, you have table

	<table id="myAwesomeTable">
	...
	</table>

First, your table has to be correctly marked

1. Table tag must have following attributes with appropriate values:
+ data-vo-table-id
+ data-vo-table-name
+ data-vo-table-url

2. Don't miss thead and tbody tags

Column sorting feature
----------------------

allows to sort columns by clicking on column headings, markup you need for this:

1. Table headings must be in th tags, with possible attribute data-type ( valid values are 'string', 'numerical', 'sexagesimal', 'astronomical-object-name' ), used for sorting ( default assuming that column has 'numerical' data-type )

Row highlighting feature
------------------------

allows to highlight rows in table by mouse on page and on samp-clients subscribed on 'table.highlight.row' message,
also receives such messages and shows selected rows.
To make it work you need:

1. Every row ( tr tag ) must have data-index attribute

<a name="coordinate-cell-handler" href="#coordinate-cell-handler"></a>

Coordinate cell handler
-----------------------

allows to show point at the sky in sky atlases like Aladin.
It needs:

1. Coordinate columns must be marked through class coords in col tag
2. Row ( tr tag ) must have attributes
+ data-coords e.g. "11:14:20.2 -57:33:04"
+ data-name
+ data-radius e.g. "12.600"

Just define id of your table before initialization:

	AstroTools.tableId = 'myAwesomeTable';
	AstroTools.init();

And after connection to hub you will receive all features described above.

Markup Example
--------------

	<table id="myAwesomeTable"
	 data-vo-table-id="some_id"
	 data-vo-table-name="Some Catalog"
	 data-vo-table-url="http://somesite/sometable/">
	<colgroup>
		<col>
		<col class="coords">
	</colgroup>
	<thead>
		<tr>
			<th data-type="string">Name</th>
			<th data-type="sexagesimal">Coordinates</th>
		</tr>
	</thead>
	<tbody>
	<tr data-index="0" data-coords="06:07:27.8 +24:05:53" data-name="NGC 2158" data-radius="13.500">
		<td>FooBar</td>
		<td>06:07:27.8</td>
	</tr>
	</tbody>
	</table>

Table Links
-----------

You can add class _at-table-link_ to any hyperlink making it broadcastable after connection.
You must also define _data-vo-table-id_ and _data-vo-table-name_ attributes.

Markup Example
-------------- 

	<a class="at-table-link" data-vo-table-id="123456" href="http://andromeda.star.bris.ac.uk/data/messier.xml" data-vo-table-name="Exampe table">Table</a>

Contact me anotheroneackap@gmail.com, if you still have a question.
