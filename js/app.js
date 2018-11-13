var map = null;
var markerLayers = null;
var apiAuthEmail = '';
var apiAuthPassword = '';

$(function() {	
    map = initMap();
    initAutoComplete();
});

function initMap() {
	var center = L.bounds([1.56073, 104.11475], [1.16, 103.502]).getCenter();
	var map = L.map('mapdiv').setView([center.x, center.y], 12);
	
	var basemap = L.tileLayer('https://maps-{s}.onemap.sg/v3/Default/{z}/{x}/{y}.png', {
		detectRetina: true,
		maxZoom: 18,
		minZoom: 11,
		attribution: '<img src="https://docs.onemap.sg/maps/images/oneMap64-01.png" style="height:20px;width:20px;"/> New OneMap | Map data © contributors, <a href="http://SLA.gov.sg">Singapore Land Authority</a>'
	});

	map.setMaxBounds([[1.56073, 104.1147], [1.16, 103.502]]);

	basemap.addTo(map);

	function getLocation() {
		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(showPosition);
		} 
	}

	function showPosition(position) {           
		marker = new L.Marker([position.coords.latitude, position.coords.longitude], {bounceOnAdd: false}).addTo(map);             
		var popup = L.popup()
			.setLatLng([position.coords.latitude, position.coords.longitude]) 
			.setContent('You are here!')
			.openOn(map);         
	}
	
	markerLayers = L.layerGroup().addTo(map);
	
	return map;
};

function initAutoComplete() {
    var location = new Bloodhound({
        datumTokenizer: function(datum) {
            return Bloodhound.tokenizers.whitespace(datum.value);
        },
        queryTokenizer: Bloodhound.tokenizers.whitespace,
        remote: {
            url: 'https://developers.onemap.sg/commonapi/search?searchVal=%QUERY&returnGeom=Y&getAddrDetails=Y',
            wildcard: '%QUERY',
            filter: (data) => {
                return $.map(data.results, (result) => {
                    return {
                        value: result.ADDRESS,
                        lat: result.LATITUDE,
                        lon: result.LONGITUDE
                    };
                });
            }
        }
    });
    
    location.initialize();
            
    $('#from-wrapper .typeahead').typeahead({
        hint: false,
        highlight: true,
        minLength: 1
    }, {
        name: 'value',
        displayKey: 'value',
        source: location.ttAdapter()
    }).on('typeahead:selected', function(event, data){            
        $('#fromLat').val(data.lat);
        $('#fromLon').val(data.lon);
    });
    
    $('#to-wrapper .typeahead').typeahead({
        hint: false,
        highlight: true,
        minLength: 1
    }, {
        name: 'value',
        displayKey: 'value',
        source: location.ttAdapter()
    }).on('typeahead:selected', function(event, data){       
        $('#toLat').val(data.lat);
        $('#toLon').val(data.lon);
    });
};

function planJourney() {
    var fromLat = $('#fromLat').val();
    var fromLon = $('#fromLon').val();
    var toLat = $('#toLat').val();
    var toLon = $('#toLon').val();
    var mode = $('#mode').val();
    
    // Show loading
    $('#options').html('<i class="fas fa-spinner fa-spin"></i> loading...');
    $('#details').html('<i class="fas fa-spinner fa-spin"></i> loading...');
    
	if (Cookies.get('token') && moment.unix(Cookies.get('token_expiry')).isAfter(moment())) {
		// Use token from cookie if still valid
		var token = Cookies.get('token');
		var url = 'https://developers.onemap.sg/privateapi/routingsvc/route?start='+fromLat+','+fromLon+'&end='+toLat+','+toLon+'&date='+moment().format('YYYY-MM-DD')+'&time='+moment().format('HHmmss')+'&mode=' + mode + '&routeType=pt&token='+token;
			
		$.get(url, function(data) {
			$('#planResult').val(JSON.stringify(data));
			parseResult(data);
		});
	} else {
		// Do authentication
		$.when(getToken()).done(function(data) {
			var token = JSON.parse(data).access_token;
			var url = 'https://developers.onemap.sg/privateapi/routingsvc/route?start='+fromLat+','+fromLon+'&end='+toLat+','+toLon+'&date='+moment().format('YYYY-MM-DD')+'&time='+moment().format('HHmmss')+'&mode=' + mode + '&routeType=pt&token='+token;
			
			Cookies.set('token', JSON.parse(data).access_token);
			Cookies.set('token_expiry', JSON.parse(data).expiry_timestamp);
			
			$.get(url, function(data) {
				$('#planResult').val(JSON.stringify(data));
				parseResult(data);
			});
		});
	}
}

function parseResult(data, optionShown = 0) {
    var planToBeDisplayed = data.plan.itineraries[optionShown];
    
    $('#options').empty();
    $('#details').empty();
    clearMap();
    
    data.plan.itineraries.forEach(function(data, index) {
        var duration = data.duration * 1000;
        var fare = data.fare;
        var legsCount = data.legs.length;
    
        var firstPoint = data.legs[0].to.name.toProperCase();
        var lastPoint = data.legs[legsCount - 1].from.name.toProperCase();
        
        if (optionShown == index) {
            $('#options').append(
                '<div class="card text-white bg-primary" style="margin-top: 10px; cursor: pointer;" onclick="switchRoute(' + index + ')">' + 
                  '<div class="card-body">' +
                    '<h5 class="card-title">' + humanizeDuration(duration, { units: ['h', 'm'], round: true }) + '</h5>' +
                    '<h6 class="card-subtitle mb-2">$' + fare + '</h6>' +
                    '<p class="card-text">' + getOptionDescription(data.legs) + '</p>' +
                  '</div>' +
                '</div>'
            );
        } else {
            $('#options').append(
                '<div class="card" style="margin-top: 10px; cursor: pointer;" onclick="switchRoute(' + index + ')">' + 
                  '<div class="card-body">' +
                    '<h5 class="card-title">' + humanizeDuration(duration, { units: ['h', 'm'], round: true }) + '</h5>' +
                    '<h6 class="card-subtitle mb-2">$' + fare + '</h6>' +
                    '<p class="card-text">' + getOptionDescription(data.legs) + '</p>' +
                  '</div>' +
                '</div>'
            );
        }
    });
                
    planToBeDisplayed.legs.forEach(function(data) {
        drawRoute(data);
    });
    
    planToBeDisplayed.legs.forEach(function(data) {
        fillDetails(data);
    });
    
    map.fitBounds([
        [data.plan.from.lat, data.plan.from.lon],
        [data.plan.to.lat, data.plan.to.lon]
    ]);
}

function drawRoute(data) {
    var style = null;
    if (data.mode == 'WALK') {
        style = {
            weight: 5,
            color: '#484848',
            dashArray: '10,10',
            opacity: 0.6
        };
    } else if (data.mode == 'SUBWAY') {				
        style = {
            weight: 5,
            color: getRailColor(data.route),
            opacity: 0.6
        };
    } else {
        style = {
            weight: 5,
            color: '#000000',
            opacity: 0.6
        };
    }

    var encodedGeometry = data.legGeometry.points;
    var polyline = L.Polyline.fromEncoded(encodedGeometry, style).addTo(map);	

    var marker = L.marker([data.from.lat, data.from.lon]).addTo(markerLayers);
    marker.bindPopup(data.from.name.toProperCase())
    
    var marker = L.marker([data.to.lat, data.to.lon]).addTo(markerLayers);
    marker.bindPopup(data.to.name.toProperCase())
}

function fillDetails(data) {
    var duration = data.duration * 1000;
    
    if (data.mode == 'BUS') {
        $('#details').append(
            '<div class="card" style="margin-top: 10px;">' + 
              '<div class="card-body">' +
                '<h5 class="card-title">' + data.from.name.toProperCase() + ' - ' + data.to.name.toProperCase() + '</h5>' +
                '<h6 class="card-subtitle mb-2 text-muted">' + humanizeDuration(duration, { units: ['h', 'm'], round: true }) + '</h6>' +
                '<p class="card-text"><i class="' + getIcon(data.mode) + '"></i> ' + data.mode.toProperCase() + ' - ' + data.route + '</p>' +
              '</div>' +
            '</div>'
        );
    } else {
        $('#details').append(
            '<div class="card" style="margin-top: 10px;">' + 
              '<div class="card-body">' +
                '<h5 class="card-title">' + data.from.name.toProperCase() + ' - ' + data.to.name.toProperCase() + '</h5>' +
                '<h6 class="card-subtitle mb-2 text-muted">' + humanizeDuration(duration, { units: ['h', 'm'], round: true }) + '</h6>' +
                '<p class="card-text"><i class="' + getIcon(data.mode) + '"></i> ' + data.mode.toProperCase() + '</p>' +
              '</div>' +
            '</div>'
        );
    }
}

function getOptionDescription(legs) {
    var joureys = [];
    
    legs.forEach(function(data){
        if (data.mode == 'SUBWAY') {
            joureys.push('<i class="' + getIcon(data.mode) + '"></i> <span class="badge text-white" style="background-color:' + getRailColor(data.route) + '">' + data.route + '</span>');
        } else if (data.mode == 'BUS') {
            joureys.push('<i class="' + getIcon(data.mode) + '"></i> <span class="badge text-white badge-secondary">' + data.route + '</span>');
        }
    });
    
    return joureys.join(' > ');
}

function getIcon(mode) {
    if (mode == 'SUBWAY') {
        return 'fas fa-subway';
    } else if (mode == 'BUS') {
        return 'fas fa-bus';
    } else if (mode == 'WALK') {
        return 'fas fa-walking';
    } else {
        return '';
    }
}

function getRailColor(rail) {
    var color = '#00000000';
    if (rail == 'EW') {
        var color = '#019644';
    } else if (rail == 'NS') {
        var color = '#d82b0d';
    } else if (rail == 'CC' || rail == 'CE') {
        var color = '#f99f0a';
    } else if (rail == 'NE') {
        var color = '#9502ab';
    } else if (rail == 'DT') {
        var color = '#015dca';
    } else if (rail == 'TE') {
        var color = '#683a23';
    } else if (rail == 'SS') {
        var color = '#fb4e8e';
    } else if (rail == 'LRT') {
        var color = '#718470';
    }
    
    return color;
}

function clearMap() {
    for(i in map._layers) {
        if(map._layers[i]._path != undefined) {
            try {
                map.removeLayer(map._layers[i]);
            }
            catch(e) {
                console.log("problem with " + e + map._layers[i]);
            }
        }
    }
    
    markerLayers.clearLayers();
}

function switchRoute(index) {
    var data = JSON.parse($('#planResult').val());
    parseResult(data, index);
}

function getToken() {
    var form = new FormData();
    form.append('email', apiAuthEmail);
    form.append('password', apiAuthPassword);

    var settings = {
        'async': true,
        'crossDomain': true,
        'url': 'https://developers.onemap.sg/privateapi/auth/post/getToken',
        'method': "POST",
        'processData': false,
        'contentType': false,
        'mimeType': 'multipart/form-data',
        'data': form
    }

    return $.ajax(settings);
};

String.prototype.toProperCase = function () {
    return this.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
};
