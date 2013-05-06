var LipContour = {
	border: 4,
	clamp: function(a, min, max) {
		return Math.min(Math.max(a, min), max);
	},
	getComponent:function(imageData, x,y, c) {
		return imageData.data[(x + y*imageData.width)*4+c];
	},
	scoreCornerComponent:function(imageData, x,y, c) {
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
	scoreCorner:function(imageData, x,y) {
		var r = this.scoreCornerComponent(imageData, x,y, 0);
		var g = this.scoreCornerComponent(imageData, x,y, 1);
		var b = this.scoreCornerComponent(imageData, x,y, 2);
		return r*r + g*g + b*b;
	},
	findCorners:function(imageData, limit) {
		var corner = [[999999999999,0,0]]; // score,x,y
		var x = imageData.width/2;
		for(var y = this.border; y < imageData.height-this.border ; y++) {
			var score = this.scoreCorner(imageData,x,y);
			if(score < corner[corner.length-1][0]) {
				corner.push([score,x,y]);
				corner = corner.sort();
				if(corner.length > limit) {
					corner.pop();
				}
			}
		}
		return corner;
	},
    find:function(imageData){
        return this.findCorners(imageData, 4);
    }
}

