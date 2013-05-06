var LipContour = {
	border: 2,
	clamp: function(a, min, max) {
		return Math.min(Math.max(a, min), max);
	},
	getComponent:function(imageData, x,y, c) {
		return imageData.data[(x + y*imageData.width)*4+c];
	},
	errorCornerComponent:function(imageData, x,y, c) {
		var error = 0;
		var c0 = this.getComponent(imageData,x,y,c);
		for(var dy = -this.border; dy <= +this.border; dy++) {
			for(var dx = -this.border; dx <= +this.border; dx++) {
				var c = this.getComponent(imageData,x+dx,y+dy,c);
				var d = c - c0;
				d = d * d;
				error += (dx >= dy && dx >= -dy) ? d : -d;
			}
		}
		return error;
	},
	errorCorner:function(imageData, x,y) {
		var r = this.errorCornerComponent(imageData, x,y, 0);
		var g = this.errorCornerComponent(imageData, x,y, 1);
		var b = this.errorCornerComponent(imageData, x,y, 2);
		return r*r + g*g + b*b;
	},
	findCorners:function(imageData, limit) {
		var corner = [[999999999999,0,0]]; // x,y,error
		for(var y = this.border; y < imageData.height-this.border ; y++) {
			for(var x = this.border; x < imageData.width-this.border ; x++) {
				var error = this.errorCorner(imageData,x,y);
				if(error < corner[corner.length-1][0]) {
					corner.push([error,x,y]);
					corner = corner.sort();
					if(corner.length > limit) {
						corner.pop();
					}
				}
			}
		}
		return corner;
	},
    find:function(imageData){
        return this.findCorners(imageData, 5);
    }
}

