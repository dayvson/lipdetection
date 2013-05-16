var LipContour = {

	num_tracks: 4,
	border: 1, // at least 1
	max_mismatch: 999999999999,
	clearance_range_factor: 0.05,
	search_range_factor: 0.15,
	reference_factor: 0.5,

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
		return {
			'11': this.getComponent(imageData,x,y,c),
			'20': this.getComponent(imageData,x+dx,y+dy-this.border,c),
			'21': this.getComponent(imageData,x+dx,y+dy,c),
			'22': this.getComponent(imageData,x+dx,y+dy+this.border,c),
			'10': this.getComponent(imageData,x,y-this.border,c),
			'12': this.getComponent(imageData,x,y-this.border,c)
		};
	},

	getBorderSample:function(imageData, x,y, dx,dy) {
		return [
			this.getBorderSampleComponent(imageData, x,y, dx,dy, 0),
			this.getBorderSampleComponent(imageData, x,y, dx,dy, 1),
			this.getBorderSampleComponent(imageData, x,y, dx,dy, 2)
		];
	},

	getBorderMismatchComponent:function(imageData, ref, x,y, dx,dy, c) {
		var sample = this.getBorderSampleComponent(imageData, x,y, dx,dy, c);

		var f0 = this.reference_factor, f1 = 1-f0;

		ref[c]['11'] = ref[c]['11'] * f0 + sample['11'] * f1;
		ref[c]['20'] = ref[c]['20'] * f0 + sample['11'] * f1;
		ref[c]['21'] = ref[c]['21'] * f0 + sample['11'] * f1;
		ref[c]['22'] = ref[c]['22'] * f0 + sample['11'] * f1;
		ref[c]['10'] = ref[c]['10'] * f0 + sample['11'] * f1;
		ref[c]['12'] = ref[c]['12'] * f0 + sample['11'] * f1;

		var r20 = sample['20'] - ref[c]['20'];
		var r21 = sample['21'] - ref[c]['21'];
		var r22 = sample['22'] - ref[c]['22'];
		var r10 = sample['10'] - ref[c]['10'];
		var r12 = sample['12'] - ref[c]['12'];

		var s20 = sample['20'] - sample['11'];
		var s21 = sample['21'] - sample['11'];
		var s22 = sample['22'] - sample['11'];
		var s10 = sample['10'] - sample['11'];
		var s12 = sample['12'] - sample['11'];

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
		// TODO keep state of all searches
		// TODO hold actual color state for each tracking point

		// track borders
        var section = this.findSection(imageData, this.num_tracks);
		section.sort(function(a,b) {return a[2] - b[2]}); // y-order
		var track = [];
		var ref, x, y, dy, dx = this.border;
		for(var i in section) {
			track[i] = {
				node: [section[i]]
			};

			// left
			dy = 0;
			x = section[i][1];
			y = section[i][2];
			ref = this.getBorderSample(imageData, x,y, -dx,dy);
			for(x-=dx; x > 0; x-=dx) {
				var node = this.trackBorder(imageData, ref, x,y, -dx,dy);
				track[i].node.push(node);
				dy = Math.floor((node[2] - y)/2);
				y = node[2];
			}

			// right
			dy = 0;
			x = section[i][1];
			y = section[i][2];
			ref = this.getBorderSample(imageData, x,y, dx,dy);
			for(x+=dx; x < imageData.width; x+=dx) {
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

