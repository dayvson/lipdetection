var LipContour = {

	num_tracks: 8,
	border: 1, // at least 1
	max_mismatch: 999999999999,
	clearance_range_factor: 0.05,
	search_range_factor: 0.1,
	reference_factor: 0.1,

	getComponent:function(imageData, x,y, c) {
		return imageData.data[(x + y*imageData.width)*4+c];
	},

	//////////////////////////////////////// SECTION

	getSectionMismatchComponent:function(imageData, x,y, c) {
		// TODO two modes upper/lower highlight ?
		var p11 = this.getComponent(imageData,x,y,c);
		var p10 = this.getComponent(imageData,x,y-this.border,c);
		var p12 = this.getComponent(imageData,x,y+this.border,c);
		var p01 = this.getComponent(imageData,x-this.border,y,c);
		var p21 = this.getComponent(imageData,x+this.border,y,c);

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

	findSection:function(imageData, limit) {
		// compute edges
		var section = [];
		var x = imageData.width/2;
		for(var y = this.border; y < imageData.height-this.border ; y++) {
			section[y] = [this.getSectionMismatch(imageData,x,y), x,y];
		}

		// find local minima
		var rank = section.slice(0).sort();
		for(var i in rank) {
			var y = rank[i][2];
			if(section[y][0] == this.max_mismatch)
				continue;
			var clearance_range = Math.ceil(imageData.height*this.clearance_range_factor);
			for(var dy = 1; dy < clearance_range; dy++) {
				if(y+dy < imageData.height-this.border)
					section[y+dy][0] = this.max_mismatch; // invalidate point
				if(y-dy >= this.border)
					section[y-dy][0] = this.max_mismatch; // invalidate point
			}
		}

		// find top lines
		return section.slice(0).sort().slice(0, limit);
	},

	//////////////////////////////////////// BORDER

	getBorderSampleComponent:function(imageData, x,y, dx,dy, c) {
		return [
			this.getComponent(imageData,x,y,c),
			this.getComponent(imageData,x+dx,y+dy-this.border,c),
			this.getComponent(imageData,x+dx,y+dy,c),
			this.getComponent(imageData,x+dx,y+dy+this.border,c),
			this.getComponent(imageData,x,y-this.border,c),
			this.getComponent(imageData,x,y-this.border,c)
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
		var r = this.getBorderMismatchComponent(imageData, ref, x,y, dx,dy, 0);
		var g = this.getBorderMismatchComponent(imageData, ref, x,y, dx,dy, 1);
		var b = this.getBorderMismatchComponent(imageData, ref, x,y, dx,dy, 2);
		return r*r + g*g + b*b;
	},


	trackBorder:function(imageData, ref, x,y, dx,dy){
		var best = [this.max_mismatch, x,y];
		var search_range = Math.ceil(imageData.height * this.search_range_factor);
		var min_y = Math.max(y - search_range, this.border);
		var max_y = Math.min(y + search_range, imageData.height-1-this.border);
		for(var cand_y = min_y; cand_y <= max_y; cand_y++) {
			var mismatch = this.getBorderMismatch(imageData, ref, x,cand_y, dx,dy);
			if(mismatch < best[0])
				best = [mismatch, x,cand_y];
		}
		return best;
	},

	//////////////////////////////////////// CONTOUR

    find:function(imageData){

		// TODO track all borders at once and stop when they cross?
		// TODO keep track of multiple possibilities up to a point and backtrack to the better one

		// track borders
        var section = this.findSection(imageData, this.num_tracks);
		section.sort(function(a,b) {return a[2] - b[2]}); // y-order
		var track = [];
		var x, y, dy, dx = this.border;
		for(var i in section) {
			track[i] = {
				node: [section[i]]
			};

			// left
			dy = 0;
			x = section[i][1];
			y = section[i][2];
			var ref = this.getBorderSample(imageData, x,y, -dx,dy);
			for(x-=dx; x > 0; x-=dx) {
				ref = this.mixSamples(ref, this.getBorderSample(imageData, x,y, -dx,dy), this.reference_factor);
				var node = this.trackBorder(imageData, ref, x,y, -dx,dy);
				track[i].node.push(node);
				dy = Math.floor((node[2] - y)/2);
				y = node[2];
			}

			// right
			dy = 0;
			x = section[i][1];
			y = section[i][2];
			var ref = this.getBorderSample(imageData, x,y, dx,dy);
			for(x+=dx; x < imageData.width; x+=dx) {
				ref = this.mixSamples(ref, this.getBorderSample(imageData, x,y, dx,dy), this.reference_factor);
				var node = this.trackBorder(imageData, ref, x,y, dx,dy);
				track[i].node.unshift(node);
				dy = Math.floor((node[2] - y)/2);
				y = node[2];
			}
		}

		// TODO find exactly two cross points
		// TODO hold the position of the cross points
		// for(var x = section[0][1]; x > 0; x-=dx) {
		// for(var i in track) {
		// 	
		// }
		// }

		

		// assemble contour
		// TODO select proper borders (those crossing the cross points)
		// TODO cleanup noise
		// TODO select only 3 or 4 borders
		var contour = [];
		var dir = 1;
		for(var i in track) {
			var j_min_max = [0, track[i].node.length-1];
			if(dir < 0)
				j_min_max = j_min_max.reverse();
			
			for(var j = j_min_max[0]; j <= j_min_max[1]; j+=dir) {
				contour.push(track[i].node[j]);
			}

			dir = -dir;
		}
		

		return contour;
    }
}

