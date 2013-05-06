var LipContour = {
	border: 4, // at least 1
	max_mismatch: 999999999999,
	getComponent:function(imageData, x,y, c) {
		return imageData.data[(x + y*imageData.width)*4+c];
	},
	getMismatchComponent:function(imageData, x,y, c) {
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
	getMismatch:function(imageData, x,y) {
		var r = this.getMismatchComponent(imageData, x,y, 0);
		var g = this.getMismatchComponent(imageData, x,y, 1);
		var b = this.getMismatchComponent(imageData, x,y, 2);
		return r*r + g*g + b*b;
	},
	findSection:function(imageData, limit) {
		// compute edges
		var section = [];
		var x = imageData.width/2;
		for(var y0 = 0; y0 < this.border ; y0++) {
			section[y0] = [this.max_mismatch, x,y0];
			var y1 = imageData.height-1-y0;
			section[y1] = [this.max_mismatch, x,y1];
		}
		for(var y = this.border; y < imageData.height-this.border ; y++) {
			section[y] = [this.getMismatch(imageData,x,y), x,y];
		}

		// find local minima
		var rank = section.slice(0).sort();
		for(var i in rank) {
			var y = rank[i][2];
			if(section[y][0] == this.max_mismatch) continue;
			for(var dy = 1; dy < this.border; dy++) {
				section[y+dy][0] = section[y-dy][0] = this.max_mismatch; // invalidate point
			}
		}

		// find top lines
		var corner = section.sort().slice(0, limit);
		return corner;
	},
    find:function(imageData){
        return this.findSection(imageData, 4);
    }
}

