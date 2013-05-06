var LipContour = {

	border: 4, // at least 1
	max_mismatch: 999999999999,
	match_range: 0.1,

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
			var clearance_range = Math.ceil(imageData.height*this.match_range);
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

	getBorderMismatchComponent:function(imageData, x,y, dx,dy, c) {
		var p11 = this.getComponent(imageData,x,y,c);
		var p20 = this.getComponent(imageData,x+dx,y+dy-this.border,c);
		var p21 = this.getComponent(imageData,x+dx,y+dy,c);
		var p22 = this.getComponent(imageData,x+dx,y+dy+this.border,c);
		var p10 = this.getComponent(imageData,x,y-this.border,c);
		var p12 = this.getComponent(imageData,x,y-this.border,c);

		var d20 = p20 - p11;
		var d21 = p21 - p11;
		var d22 = p22 - p11;
		var d10 = p10 - p11;
		var d12 = p12 - p11;

		return (d20*d20 + d21*d21 + d22*d22) / (0.00001 + d10*d10 + d12*d12);
	},

	getBorderMismatch:function(imageData, x,y, dx,dy) {
		var r = this.getBorderMismatchComponent(imageData, x,y, dx,dy, 0);
		var g = this.getBorderMismatchComponent(imageData, x,y, dx,dy, 1);
		var b = this.getBorderMismatchComponent(imageData, x,y, dx,dy, 2);
		return r*r + g*g + b*b;
	},


	trackBorder:function(imageData, x,y, dx,dy){
		var best = [this.max_mismatch, x,y];
		var search_range = Math.ceil(imageData.height * this.match_range);
		var min_y = Math.max(y - search_range, this.border);
		var max_y = Math.min(y + search_range, imageData.height-1-this.border);
		for(var cand_y = min_y; cand_y <= max_y; cand_y++) {
			var mismatch = this.getBorderMismatch(imageData, x,cand_y, dx,dy);
			if(mismatch < best[0])
				best = [mismatch, x,cand_y];
		}
		return best;
	},

	//////////////////////////////////////// CONTOUR

    find:function(imageData){
		// TODO track all borders at once and stop when they cross? (optimization)
		// TODO keep state of all searchs and hold actual colors for each tracking point

		// track borders
        var section = this.findSection(imageData, 7);
		section.sort(function(a,b) {return a[2] - b[2]}); // y-order
		var border = [];
		var y, dy;
		var dx = this.border;
		for(var i in section) {
			border[i] = [];
			dy = 0;
			y = section[i][2];
			for(var x = section[i][1]; x > 0; x-=dx) {
				var node = this.trackBorder(imageData, x,y, -dx,dy);
				border[i].push(node);
				dy = Math.floor((node[2] - y)/2);
				y = node[2];
			}
			dy = 0;
			y = section[i][2];
			for(var x = section[i][1]; x < imageData.width; x+=dx) {
				var node = this.trackBorder(imageData, x,y, dx,dy);
				border[i].unshift(node);
				dy = Math.floor((node[2] - y)/2);
				y = node[2];
			}
		}

		// TODO find exactly two cross points
		// TODO hold the position of the cross points
		// for(var x = section[0][1]; x > 0; x-=dx) {
		// for(var i in border) {
		// 	
		// }
		// }

		

		// assemble contour
		// TODO select proper borders (those crossing the cross points)
		// TODO cleanup noise
		// TODO select only 3 or 4 borders
		var contour = [];
		var dir = 1;
		for(var i in border) {
			var j_min_max = [0, border[i].length-1];
			if(dir < 0)
				j_min_max = j_min_max.reverse();
			
			for(var j = j_min_max[0]; j <= j_min_max[1]; j+=dir) {
				contour.push(border[i][j]);
			}

			dir = -dir;
		}
		

		return contour;
    }
}

