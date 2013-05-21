var LipContour = {

	debug:true,
	use_rgb: true, // merge rgb and hsl border tracking
	use_hsl: true, // merge rgb and hsl border tracking
	num_sections: 5, // number of sections to find the starting track points
	num_tracks: 12, // number of lines to track per section per colorspace
	track_spacing: 2, // at least 1, spacing between tracking points
	section_spacing_factor: 0.1, // distance between section cuts, if there is more than one
	clearance_range_factor: 0.05, // clear section points closer than this factor times height
	search_range_factor: 0.1, // scan up and down for tracking horizontal lines this ammount times height
	reference_factor: 0.95, // for each step this is the weight of the reference track points color that is kept for the next step
	min_width: 0.2, // minimum mouth length wide to each side in relation to the image size
	//crossPoint: [[0,0,0],[0,0,0]],

	getComponent:function(imageData, x,y, c) {
		return imageData.data[(x + y*imageData.width)*4+c];
	},

	//////////////////////////////////////// SECTION

	getSectionMismatchComponent:function(imageData, x,y, c) {
		// TODO two modes upper/lower highlight ?
		var p11 = this.getComponent(imageData,x,y,c);
		var p10 = this.getComponent(imageData,x,y-this.track_spacing,c);
		var p12 = this.getComponent(imageData,x,y+this.track_spacing,c);
		var p01 = this.getComponent(imageData,x-this.track_spacing,y,c);
		var p21 = this.getComponent(imageData,x+this.track_spacing,y,c);

		var d10 = p10 - p11;
		var d12 = p12 - p11;
		var d01 = p01 - p11;
		var d21 = p21 - p11;

		return (d01*d01 + d21*d21) / (0.00001 + d10*d10 + d12*d12);
	},

	getSectionMismatch:function(imageData, x,y) {
		var r = this.getSectionMismatchComponent(imageData, x,y, 0);
		var g = this.getSectionMismatchComponent(imageData, x,y, 1);
		var b = this.getSectionMismatchComponent(imageData, x,y, 2);
		return r*r + g*g + b*b;
	},

	findSection:function(imageData, limit, offset) {
		// compute edges
		var section = [];
		var x = Math.round(imageData.width/2 + offset);
		for(var y = this.track_spacing; y < imageData.height-this.track_spacing ; y++) {
			section[y] = [this.getSectionMismatch(imageData,x,y), x,y];
		}

		// find local minima
		var INVALID = Number.MAX_VALUE;
		var rank = section.slice(0).sort(); // copy and sort
		var clearance_range = Math.ceil(imageData.height*this.clearance_range_factor);
		for(var i in rank) {
			var y = rank[i][2];
			if(section[y][0] == INVALID)
				continue;
			for(var dy = 1; dy < clearance_range; dy++) {
				if(y+dy < imageData.height-this.track_spacing)
					section[y+dy][0] = INVALID; // invalidate point
				if(y-dy >= this.track_spacing)
					section[y-dy][0] = INVALID; // invalidate point
			}
		}

		// find top lines
		rank = section.slice(0).sort(); // copy and sort
		var selected = [];
		for(var i = 0, n = Math.min(rank.length, limit); i < n; i++) {
			if(rank[i][0] == INVALID)
				break;
			selected.push(rank[i]);
		}

		return selected;
	},

	//////////////////////////////////////// BORDER

	getBorderSampleComponent:function(imageData, x,y, dx,dy, c) {
		return [
			this.getComponent(imageData,x,y,c),
			this.getComponent(imageData,x+dx,y+dy-this.track_spacing,c),
			this.getComponent(imageData,x+dx,y+dy,c),
			this.getComponent(imageData,x+dx,y+dy+this.track_spacing,c),
			this.getComponent(imageData,x,y-this.track_spacing,c),
			this.getComponent(imageData,x,y-this.track_spacing,c)
		];
	},

	getBorderSample:function(imageData, x,y, dx,dy) {
		return [
			this.getBorderSampleComponent(imageData, x,y, dx,dy, 0),
			this.getBorderSampleComponent(imageData, x,y, dx,dy, 1),
			this.getBorderSampleComponent(imageData, x,y, dx,dy, 2)
		];
	},

	mixSamples:function(a, b, factor) {

		var f0 = factor, f1 = 1-f0;

		return [
			[
				a[0][0] * f0 + b[0][0] * f1,
				a[0][1] * f0 + b[0][1] * f1,
				a[0][2] * f0 + b[0][2] * f1,
				a[0][3] * f0 + b[0][3] * f1,
				a[0][4] * f0 + b[0][4] * f1,
				a[0][5] * f0 + b[0][5] * f1
			],
			[
				a[1][0] * f0 + b[1][0] * f1,
				a[1][1] * f0 + b[1][1] * f1,
				a[1][2] * f0 + b[1][2] * f1,
				a[1][3] * f0 + b[1][3] * f1,
				a[1][4] * f0 + b[1][4] * f1,
				a[1][5] * f0 + b[1][5] * f1
			],
			[
				a[2][0] * f0 + b[2][0] * f1,
				a[2][1] * f0 + b[2][1] * f1,
				a[2][2] * f0 + b[2][2] * f1,
				a[2][3] * f0 + b[2][3] * f1,
				a[2][4] * f0 + b[2][4] * f1,
				a[2][5] * f0 + b[2][5] * f1
			]
		];
	},


	getBorderMismatchComponent:function(imageData, ref, x,y, dx,dy, c) {
		var sample = this.getBorderSampleComponent(imageData, x,y, dx,dy, c);

		var r20 = sample[1] - ref[c][1];
		var r21 = sample[2] - ref[c][2];
		var r22 = sample[3] - ref[c][3];
		var r10 = sample[4] - ref[c][4];
		var r12 = sample[5] - ref[c][5];

		var s20 = sample[1] - sample[0];
		var s21 = sample[2] - sample[0];
		var s22 = sample[3] - sample[0];
		var s10 = sample[4] - sample[0];
		var s12 = sample[5] - sample[0];

		return (
			r20*r20 + r21*r21 + r22*r22 + r10*r10 + r12*r12 +
			s20*s20 + s21*s21 + s22*s22
		) / (0.00001 + s10*s10 + s12*s12);
	},

	getBorderMismatch:function(imageData, ref, x,y, dx,dy) {
		var c1 = this.getBorderMismatchComponent(imageData, ref, x,y, dx,dy, 0);
		var c2 = this.getBorderMismatchComponent(imageData, ref, x,y, dx,dy, 1);
		var c3 = this.getBorderMismatchComponent(imageData, ref, x,y, dx,dy, 2);
		return c1*c1 + c2*c2 + c3*c3;
	},


	trackBorder:function(imageData, ref, x,y, dx,dy){
		var best = [Number.MAX_VALUE, x,y];
		var search_range = Math.ceil(imageData.height * this.search_range_factor);
		var min_y = Math.max(y - search_range, this.track_spacing);
		var max_y = Math.min(y + search_range, imageData.height-1-this.track_spacing);
		for(var cand_y = min_y; cand_y <= max_y; cand_y++) {
			var mismatch = this.getBorderMismatch(imageData, ref, x,cand_y, dx,dy);
			if(mismatch < best[0])
				best = [mismatch, x,cand_y];
		}
		return best;
	},

	//////////////////////////////////////// CONTOUR

	findTracks:function(imageData, offset) {
		// TODO local decisions are very important, as global ones are (because of shadow differences)
		// TODO score the distance between colors in all points (store colors in notes, expand all possible nodes and score each combination of branches)
		// TODO track all borders at once and avoid crossing or even stop when they cross?
		// TODO keep track of multiple possibilities up to a point and backtrack to the better one

		// track borders
        var section = this.findSection(imageData, this.num_tracks, offset);
		section.sort(function(a,b) {return a[2] - b[2]}); // y-order
		var track = [];
		var x, y, dy, dx = this.track_spacing;
		for(var i = 0; i < section.length; i++) {
			track[i] = {
				node: [section[i]]
			};

			// left
			dy = 0;
			x = section[i][1];
			y = section[i][2];
			var ref = this.getBorderSample(imageData, x,y, -dx,dy);
			for(x-=dx; x > this.track_spacing; x-=dx) {
				ref = this.mixSamples(ref, this.getBorderSample(imageData, x,y, -dx,dy), this.reference_factor);
				var node = this.trackBorder(imageData, ref, x,y, -dx,dy);
				node[0] *= section[i][0]; // XXX not sure if should propagate section error to it's nodes
				track[i].node.push(node);
				y = node[2];
			}

			// right
			dy = 0;
			x = section[i][1];
			y = section[i][2];
			var ref = this.getBorderSample(imageData, x,y, dx,dy);
			for(x+=dx; x < imageData.width-this.track_spacing; x+=dx) {
				ref = this.mixSamples(ref, this.getBorderSample(imageData, x,y, dx,dy), this.reference_factor);
				var node = this.trackBorder(imageData, ref, x,y, dx,dy);
				node[0] *= section[i][0]; // XXX not sure if should propagate section error to it's nodes
				track[i].node.unshift(node);
				y = node[2];
			}
		}

		return track;
	},

	mergeTracks:function(trackBase, track) {
		for(var i = 0; i < track.length; i++) {
			trackBase.push(track[i]);
		}
	},

	normalizeTracks:function(track) {
		// normalize score
		var min = Number.MAX_VALUE;
		var max = 0;
		var avg = 0;
		var count = 0;
		for(var i = 0; i < track.length; i++) {
			for(var j = 0, n = track[i].node.length; j<n; j++){
				var v = track[i].node[j][0];
				if(v < min) min = v;
				if(v > max) max = v;
				avg += v;
				count ++;
			}
			avg /= count;
		}

		//max = max * 0.001 + 0.999 * avg;
		//min = min * 0.001 + 0.999 * avg;

		for(var i = 0; i < track.length; i++) {
			for(var j = 0, n = track[i].node.length; j<n; j++){
				//track[i].node[j][0] = Math.min(1,Math.max(0, (track[i].node[j][0]-min) / (max-min) ));
				track[i].node[j][0] = (track[i].node[j][0]-min) / (max-min);
			}
		}
	},

	findCrossPoints:function(imageData, track) {
		// TODO find the crosspoints comparing the distance between points and not the histogram (the later may cause aliasing)

		var min_width = imageData.width * this.min_width;
		var cx = Math.floor(imageData.width/2);
		var cy = Math.floor(imageData.height/2);
		var cx0 = cx - min_width;
		var cx1 = cx + min_width;
		var crossPoint = [[Number.MAX_VALUE, cx0, cy], [Number.MAX_VALUE, cx1, cy]];

		var w = imageData.width,
		    h = imageData.height,
		    average = new Array(w);

		// find the average line
		for(var x = 0; x < w; x++) {
			average[x] = new Float32Array(3); // distance, y average, y count
		}

		for(var i = 0; i < track.length; i++) {
			for(var j = 0; j < track[i].node.length; j++) {
				var x = track[i].node[j][1],
				    y = track[i].node[j][2];
				average[x][1] += y;
				average[x][2] ++;
			}
		}

		for(var x = 0; x < w; x++) {
			if(average[x][2] == 0) continue;
			average[x][1] = Math.floor(average[x][1] / average[x][2]);
		}

		// distance to average line
		for(var i = 0; i < track.length; i++) {
			for(var j = 0; j < track[i].node.length; j++) {
				var x = track[i].node[j][1],
				    y = track[i].node[j][2];
				var distance = Math.abs(y - average[x][1]);
				average[x][0] += distance*distance / (0.001+track[i].node[j][0]);
			}
		}

		var range = this.section_spacing_factor * w;
		for(var x = 0; x < w; x++) {
			if(average[x][2] == 0) continue;
			//if(x > cx0 && x < cx1) continue;
			var i = Math.floor(x / cx);
			var distance = average[x][0] / (h+average[x+(i?-range:+range)][0])
			if(distance < crossPoint[i][0]) {
				crossPoint[i] = [distance, x, average[x][1]];
			}
		}

		// debug
		if(this.debug) {
			imageData.data[(crossPoint[0][1] + crossPoint[0][2] * w)*4 + 0] = 0xff;
			imageData.data[(crossPoint[0][1] + crossPoint[0][2] * w)*4 + 1] = 0xff;
			imageData.data[(crossPoint[0][1] + crossPoint[0][2] * w)*4 + 2] = 0xff;

			imageData.data[(crossPoint[1][1] + crossPoint[1][2] * w)*4 + 0] = 0xff;
			imageData.data[(crossPoint[1][1] + crossPoint[1][2] * w)*4 + 1] = 0xff;
			imageData.data[(crossPoint[1][1] + crossPoint[1][2] * w)*4 + 2] = 0xff;

			//console.log(crossPoint[0][1], crossPoint[0][2], crossPoint[1][1], crossPoint[1][2] );
		}

		// reduce relevance of non-convergent lines
		for(var i = 0; i < track.length; i++) {
			var closest = [Number.MAX_VALUE, Number.MAX_VALUE];
			for(var j = 0; j < track[i].node.length; j++) {
				var x = track[i].node[j][1],
				    y = track[i].node[j][2];
				var k = Math.floor(x / cx);
				if(crossPoint[k][1] == x) {
					var dx = Math.abs(x - crossPoint[k][1]);
					var dy = Math.abs(y - crossPoint[k][2]);
					var distance = Math.sqrt(dx*dx + dy*dy);
					if(distance < closest[k])
						closest[k] = distance;
				}
			}
			track[i].closest = closest;

		}

		for(var i = 0; i < track.length; i++) {
			for(var j = 0; j < track[i].node.length; j++) {
				var x = track[i].node[j][1];
				var k = Math.floor(x / cx);
				var err_point = Math.pow(Math.max(1,(Math.abs(x-cx) - Math.abs(crossPoint[k][1]-cx))), 10); // FIXME hardcoded
				var err_line = Math.pow(1+track[i].closest[0]*track[i].closest[1], 4); // FIXME hardcoded
				track[i].node[j][0] *= err_line * err_point;
			}
		}
		//this.normalizeTracks(track);

		return crossPoint;
	},

	convertImageDataRGBtoHSL:function(imageDataRGB) {
		var i;

		// convert image data do HSL with high contrast on hue and low on lighting
		var hsl = new Uint32Array(imageDataRGB.data.length);
		var rgb = new Uint8Array(imageDataRGB.data.buffer);
		i=0;
		while(i < rgb.length) {
			var r = rgb[i+0] / 255.;
			var g = rgb[i+1] / 255.;
			var b = rgb[i+2] / 255.;

			var max = Math.max(r, g, b), min = Math.min(r, g, b);
			var delta = max - min;
			var hue = 0;
			var brightness = max;
			var saturation = max == 0 ? 0 : (max - min) / max;
			if (delta != 0) {
				if (r == max) {
					hue = (g - b) / delta;
				} else {
					if (g == max) {
						hue = 2 + (b - r) / delta; 
					} else {
						hue = 4 + (r - g) / delta;
					}
				}
				hue *= 60;
				hue += 270; // XXX put the reds in the middle of the scale
				if (hue < 0) hue += 360;
				else if (hue > 360) hue -= 360;
			}

			// weights
			brightness /= 8.0;
			saturation /= 2.0;

			if(this.debug) {
				rgb[i+0] = Math.floor( hue / 360. * 255);
				rgb[i+1] = Math.floor( brightness * 255); // XXX to display, brightness is better in green
				rgb[i+2] = Math.floor( saturation * 255);
			}

			hsl[i+0] = hue / 360. * 65535;
			hsl[i+1] = saturation * 65535;
			hsl[i+2] = brightness * 65535;
			i+=4;
		}

		return {
			width: imageDataRGB.width,
			height: imageDataRGB.height,
			data: hsl
		};
	},

    find:function(imageData){

		var track = []

		if(this.use_rgb) {
			var trackRGB = [];
			var section_spacing = this.section_spacing_factor * imageData.width;
			var range = section_spacing * Math.ceil((this.num_sections-1)/2);
			for(var offset=-range; offset <= range; offset += section_spacing) {
				this.mergeTracks(trackRGB, this.findTracks(imageData, offset));
			}
			this.normalizeTracks(trackRGB);
			this.mergeTracks(track, trackRGB);
		}

		if(this.use_hsl) {
			var imageDataHSL = this.convertImageDataRGBtoHSL(imageData);
			var trackHSL = this.findTracks(imageData, 0);
			this.normalizeTracks(trackHSL);
			this.mergeTracks(track, trackHSL);
		}


		// find exactly two cross points
		// TODO keep the state of the position of the cross points, merge across time
		var crossPoint = this.findCrossPoints(imageData, track);

		// FIXME not using score anymore, using distance (error, mismatch); flip the factor weight logic
		//{ // left
		//	var f = this.crossPoint[0][0] + this.crossPoint[0][0], 
		//		f0 = this.crossPoint[0][0] / f, 
		//		f1 = crossPoint[0][0] / f;
		//	this.crossPoint[0][0] = crossPoint[0][0];
		//	this.crossPoint[0][1] = this.crossPoint[0][1] * f0 + f1 * crossPoint[0][1];
		//	this.crossPoint[0][2] = this.crossPoint[0][2] * f0 + f1 * crossPoint[0][2];
		//}
		//{ // right
		//	var f = this.crossPoint[0][0] + this.crossPoint[0][0], 
		//		f0 = this.crossPoint[0][0] / f, 
		//		f1 = crossPoint[0][0] / f;
		//	this.crossPoint[1][0] = crossPoint[1][0];
		//	this.crossPoint[1][1] = this.crossPoint[1][1] * f0 + f1 * crossPoint[1][1];
		//	this.crossPoint[1][2] = this.crossPoint[1][2] * f0 + f1 * crossPoint[1][2];
		//}

		// TODO select proper borders (those crossing the cross points)
		// TODO cleanup noise

		// assemble contour
		// TODO select only 3 or 4 borders
		var contour = [];
		var dir = 1;
		for(var i = 0; i < track.length; i++) {
			var j_min_max = [0, track[i].node.length-1];
			if(dir < 0)
				j_min_max = j_min_max.reverse();
			
			for(var j = j_min_max[0]; j != j_min_max[1]; j+=dir) {
				//if(track[i].node[j][1] < crossPoint[0][1] || track[i].node[j][1] > crossPoint[1][1]) continue;
				contour.push(track[i].node[j]);
			}

			dir = -dir;
		}
		

		return contour;
    }
}

