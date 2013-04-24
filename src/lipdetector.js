
// ConvexHull: http://en.literateprograms.org/Quickhull_(Javascript)
var ConvexHull = {
	getDistance:function(point, baseline){
		var vx, vy;
		vx = baseline[0].x - baseline[1].x;
    	vy = baseline[1].y - baseline[0].y;
    	return (vx * (point.y - baseline[0].y) + vy * (point.x - baseline[0].x))
	},
	findMostDistantPointFromBaseLine:function(baseLine, points) {
	    var maxD = 0, maxPt, newPoints = [], currentPoint, dist;
	    for (var idx in points) {
	        currentPoint = points[idx];
	        dist = this.getDistance(currentPoint, baseLine);
	        if ( dist <= 0) continue;
			newPoints.push(currentPoint);	
	        if ( dist > maxD ) {
	            maxD = dist;
	            maxPt = currentPoint;
	        }
	    }
	    return {'maxPoint':maxPt, 'newPoints':newPoints};
	},
	build:function(baseLine, points) {
	    var convexHullBaseLines = [], result;
	    result = this.findMostDistantPointFromBaseLine(baseLine, points);
	    if (result.maxPoint) {
	        convexHullBaseLines = convexHullBaseLines.concat( this.build( [baseLine[0], result.maxPoint], result.newPoints) );
	        convexHullBaseLines = convexHullBaseLines.concat( this.build( [result.maxPoint, baseLine[1]], result.newPoints) );
	        return convexHullBaseLines;
	    } else {
	        return [baseLine];
	    }
	},
	get:function(points){
		var maxX, minX, maxPt, minPt, currentPoint, i, convexhull;
	    for (i in points) {
	        currentPoint = points[i];
	        if (currentPoint.x > maxX || !maxX) {
	            maxPt = currentPoint;
	            maxX = currentPoint.x;
	        }
	        if (currentPoint.x < minX || !minX) {
	            minPt = currentPoint;
	            minX = currentPoint.x;
	        }
	    }
	    convexhull = [].concat(this.build([minPt, maxPt], points),
	                       this.build([maxPt, minPt], points))
	    return convexhull;
	}
}

var LipDetector = {
	reset: function() {
		this.point_count = 0;
		this.edges_density = 0.13;
		this.scale_factor = 1.1;
		this.min_scale = 2;
		this.use_tilted = true;

		this.laplacian = 16;
		this.confidence = 0.5;
		this.color = "black";
		this.block = { x:0, y:0, width:this.width, height:0 };

		this.motion = this.width/8;
		this.mouth = {x:this.width/2, y:this.height/2, width:0, height:0};
		this.convexhull = [];

		this.base_shape = [
			{x: 0,   y: 1},   // a
			{x: 1,   y: 0},   // b
			{x: 1.5, y: 0.2}, // c
			{x: 2,   y: 0},   // d
			{x: 3,   y: 1},   // e
			{x: 2,   y: 1.8}, // f
			{x: 1.5, y: 2},   // g
			{x: 1,   y: 1.8}  // h
		];
		this.shape = [
			{x: this.base_shape[0].x+this.width/2, y: this.base_shape[0].y+this.height}, // a
			{x: this.base_shape[1].x+this.width/2, y: this.base_shape[1].y+this.height}, // b
			{x: this.base_shape[2].x+this.width/2, y: this.base_shape[2].y+this.height}, // c
			{x: this.base_shape[3].x+this.width/2, y: this.base_shape[3].y+this.height}, // d
			{x: this.base_shape[4].x+this.width/2, y: this.base_shape[4].y+this.height}, // e
			{x: this.base_shape[5].x+this.width/2, y: this.base_shape[5].y+this.height}, // f
			{x: this.base_shape[6].x+this.width/2, y: this.base_shape[6].y+this.height}, // g
			{x: this.base_shape[7].x+this.width/2, y: this.base_shape[7].y+this.height}  // h
		];

		this.top_webcam;
		this.top_score = 0;
		this.top_contour = [];
		this.top_canny;
		this.top_roi;
		this.top_countdown = this.top_countdown_max;
		this.pause = false;
	},
	createWorkArea: function(scale, width, height) {
		var  workArea = {scale:1./scale}, h, w;
		w = (width *  workArea.scale) |0;
		h = (height *  workArea.scale)|0;
		workArea.canvas = document.createElement('canvas');
		workArea.canvas.width = w;
		workArea.canvas.height = h;
		workArea.ctx =  workArea.canvas.getContext('2d');
		workArea.img_u8 = new jsfeat.matrix_t(w, h, jsfeat.U8_t | jsfeat.C1_t);
		workArea.ii_sum = new Int32Array((w + 1) * (h + 1));
		workArea.ii_sqsum = new Int32Array((w + 1) * (h + 1));
		workArea.ii_tilted = new Int32Array((w + 1) * (h + 1));
		return  workArea;
	},
	fillCorners:function(width, height){
		var corners = [], i =0, len = width * height;
		for(i; i < len; i++) {
			corners[i] = new jsfeat.point2d_t(0,0,0,0);
		}
		return corners;
	},
	initOpticalFlow:function(){
		this.win_size = 30;
		this.max_iterations = 30;
		this.epsilon = 0.1;
		this.min_eigen = 0.00005; // 0.0075

		this.curr_img_pyr = new jsfeat.pyramid_t(3);
		this.prev_img_pyr = new jsfeat.pyramid_t(3);
		this.curr_img_pyr.allocate(this.width, this.height, jsfeat.U8_t|jsfeat.C1_t);
		this.prev_img_pyr.allocate(this.width, this.height, jsfeat.U8_t|jsfeat.C1_t);

		this.point_max_count = 256;
		this.point_count = 0;
		this.point_status = new Uint8Array(this.point_max_count);
		this.prev_xy = new Float32Array(this.point_max_count * 2);
		this.curr_xy = new Float32Array(this.point_max_count * 2);

		this.top_countdown_max = 120;
	},
    init:function(webcam, webcamCanvas, lipCanvas){
		this.debug = 1;

        this.webcam = webcam;
        this.webcamCanvas = webcamCanvas;
        this.lipCanvas = lipCanvas;
        this.webcamCanvasCtx = this.webcamCanvas.getContext('2d');
        this.lipCanvasCtx = this.lipCanvas.getContext('2d');
		this.width = this.webcam.videoWidth;
		this.height = this.webcam.videoHeight;

		this.small_work_area = this.createWorkArea(6, this.width, this.height);
		this.large_work_area = this.createWorkArea(3, this.width, this.height);
		this.corners = this.fillCorners(this.width, this.height);
		this.reset();
		this.initOpticalFlow();

    },
	haar:function(classifier, image, roi, work){
		var imageData,rects, tilted, rects, i;

		if(!work){
 			work = this.small_work_area;
		}

		if(roi) {
			this.color = "blue";
		} else {
			roi = {x:0, y:0, width:this.width, height:this.height};
			this.color = "yellow";
		}

		work.ctx.drawImage(image, roi.x, roi.y, roi.width, roi.height, 
		                   0, 0, work.canvas.width, work.canvas.height);
		imageData = work.ctx.getImageData( 0, 0, work.canvas.width, work.canvas.height);
		jsfeat.imgproc.grayscale(imageData.data, work.img_u8.data);

		// jsfeat.imgproc.equalize_histogram(work.img_u8, work.img_u8); // equalize_histogram
		tilted = this.use_tilted && classifier.tilted ? work.ii_tilted : null;
		jsfeat.imgproc.compute_integral_image(work.img_u8, work.ii_sum, work.ii_sqsum, tilted);

		jsfeat.haar.edges_density = this.edges_density;
		rects = jsfeat.haar.detect_multi_scale(work.ii_sum, work.ii_sqsum, work.ii_tilted, null, 
		                                       work.img_u8.cols, work.img_u8.rows, classifier, 
		                                       this.scale_factor, this.min_scale);
		rects = jsfeat.haar.group_rectangles(rects, 1);

		jsfeat.math.qsort(rects, 0, rects.length - 1, function(a, b){ 
			return (b.confidence < a.confidence); 
		});

		for(i in rects) { 
			rects[i].x = rects[i].x * roi.width / work.canvas.width + roi.x;
			rects[i].y = rects[i].y * roi.height / work.canvas.height + roi.y;
			rects[i].width  *= roi.width / work.canvas.width;
			rects[i].height *= roi.height / work.canvas.height;
		}

		if(this.debug > 2) {
			this.debugPos += work.canvas.width;
			this.lipCanvasCtx.putImageData( imageData, this.width - this.debugPos,0, 0, 0, 
			                               work.canvas.width, work.canvas.height);
		}

		return rects;
	},	
	cleanupOpticalFlow: function(ctx, totalPoints, mouth) {
		if(!this.point_count) return 0;
		var i, j;

		var universe = [];
		var average_count = Math.ceil(this.point_count/2);
		var median = {
			x: average_count*(mouth.x+mouth.width/2), 
			y: average_count*(mouth.y+mouth.height/2),
			width: average_count*(mouth.width), 
			height: average_count*(mouth.height)
		};
		for(i = 0; i < this.point_count; ++i) {
			var point = {
				x:this.curr_xy[i<<1], 
				y:this.curr_xy[(i<<1)+1]
			};
			universe.push(point);
			median.x += point.x;
			median.y += point.y;
			average_count++;
		}
		median.x      /= average_count;
		median.y      /= average_count;

		var average_distance = mouth.height;
		for(i=0; i< universe.length; i++) {
			average_distance += this.getDistance(median, universe[i]);
			
			median.width += Math.abs(median.x - universe[i].x)*2;
			median.height += Math.abs(median.y - universe[i].y)*2;
		}
		average_distance /= average_count;

		median.width  /= average_count;
		median.height /= average_count;

		// smooth movement of mouth region and median
		var factor = 0.75, antifactor = 1-factor;
		var new_mouth = {};
		new_mouth.x = Math.round(this.mouth.x * factor + (median.x-median.width/2) * antifactor);
		new_mouth.y = Math.round(this.mouth.y * factor + (median.y-median.height/2) * antifactor);
		new_mouth.width = Math.round(this.mouth.width * factor + median.width * antifactor);
		new_mouth.height = Math.round(this.mouth.height * factor + median.height * antifactor);


		var motion = this.getDistance(new_mouth, this.mouth);
		this.motion = this.motion * 0.95 + motion * 0.05;

		this.mouth.x = new_mouth.x;
		this.mouth.y = new_mouth.y;
		this.mouth.width = new_mouth.width;
		this.mouth.height = new_mouth.height;

		median.x = Math.round(this.mouth.x + this.mouth.width/2);
		median.y = Math.round(this.mouth.y + this.mouth.height/2);

		var border = 0.25;
		var mask = {
			x: this.mouth.x - this.mouth.width*border,
			y: this.mouth.y - this.mouth.height*border*2,
			width: this.mouth.width + this.mouth.width*border*2,
			height: this.mouth.height + this.mouth.height*border*3
		};

		ctx.strokeStyle = "cyan"
		ctx.strokeRect(median.x-1, median.y-1, 3, 3);
		this.drawRectangle(ctx,this.mouth,'red');
		this.drawRectangle(ctx,mask,'cyan');

		if(0) {
			// TODO merge both outlier remotion in an elipse
			// remove outliers (outside mouth region)
			for(i=0; i< universe.length; i++) {
				if(!this.point_status[i]) continue;
				if(universe[i].x < this.mouth.x
				|| universe[i].y < this.mouth.y
				|| universe[i].x > this.mouth.x+this.mouth.width
				|| universe[i].y > this.mouth.y+this.mouth.height
				) {
					this.point_status[i] = 0;
				}
			}
		}

		if(1) {
			// remove outliers (far from median)
			var max_distance = this.mouth.height;
			for(i=0; i< universe.length; i++) {
				if(!this.point_status[i]) continue;
				var dist = Math.sqrt( Math.pow( median.x - universe[i].x, 2) + Math.pow(Math.abs(median.y - universe[i].y), 2) );
				if(dist > max_distance) {
					this.point_status[i] = 0;
				}
			}
		}

		if(1) {
			// remove internal (convex hull)
			var central = [];
			for(i=0; i< universe.length; i++) {
				if(!this.point_status[i]) continue;
				central.push(universe[i]);
			}
			if(central.length > 4) {
				var convexhull = ConvexHull.get(central);
				for(i = 0; i < universe.length; ++i) {
					var found = 0;
					for(j = 0; j < convexhull.length; ++j) {
						if(universe[i].x == convexhull[j][0].x
						&& universe[i].y == convexhull[j][0].y ) {
							found = 1;
							break;
						}
					}
					if(!found) {
						this.point_status[i] = 0;
					}
				}
			}
		}

		// remove duplicates (too close)
		// TODO avoid removing from the edges
		var min_dist = 2;
		for(i=0; i< universe.length; i++) {
			if(!this.point_status[i]) continue;
			for(j=0; j< universe.length; j++) {
				if(i==j || !this.point_status[j]) continue;
				var dist = this.getDistance(universe[i], universe[j])
				if(dist < min_dist) {
					this.point_status[i] = 0;
				}
			}
		}

		if(1) {
			// remove track failures
			for(i=0,j=0; i < totalPoints; ++i) {
				if(this.point_status[i] == 1) {
					if(j < i) {
						this.curr_xy[ j<<1]      = this.curr_xy[ i<<1];
						this.curr_xy[(j<<1) + 1] = this.curr_xy[(i<<1) + 1];
					}
					++j;
				}
			}
			return j;
		} else {
				return totalPoints;
		}
	},
	drawOpticalFlow: function(ctx) {
		var i;
		if(this.debug > 0) {
			ctx.globalAlpha = 1;
			for(i = 0; i < this.point_count; ++i) {
				ctx.strokeStyle = "rgb("+(255*this.point_status[i])+", "+(255*this.point_status[i])+", "+(255*(1-this.point_status[i]))+")";
				ctx.strokeRect(this.curr_xy[i<<1]-1, this.curr_xy[(i<<1)+1]-1, 3, 3);
			}
		}
	},
	highLine: function (img, x0, y0, x1, y1){
		var dx = Math.abs(x1-x0);
		var dy = Math.abs(y1-y0);
		var sx = (x0 < x1) ? 1 : -1;
		var sy = (y0 < y1) ? 1 : -1;
		var err = dx-dy;

		var value = 0;
		var count = 0;
		while(true){
			var i = y0*img.cols + x0;
			var pixel = img.data[i];
			if(pixel < value) break;
			value = pixel;
			count++;

			if ((x0==x1) && (y0==y1)) break;
			var e2 = 2*err;
			if (e2 >-dy){ err -= dy; x0  += sx; }
			if (e2 < dx){ err += dx; y0  += sy; }
		}
		return {x:x0, y:y0, score:value, dist:count};
	},
	sumLine: function (img, x0, y0, x1, y1){
		var dx = Math.abs(x1-x0);
		var dy = Math.abs(y1-y0);
		var sx = (x0 < x1) ? 1 : -1;
		var sy = (y0 < y1) ? 1 : -1;
		var err = dx-dy;

		var value = 0;
		var count = 0;
		while(true){
			var i = y0*img.cols + x0;
			var pixel = img.data[i];
			value += pixel;
			count ++;

			if ((x0==x1) && (y0==y1)) break;
			var e2 = 2*err;
			if (e2 >-dy){ err -= dy; x0  += sx; }
			if (e2 < dx){ err += dx; y0  += sy; }
		}
		return value / count / 255.;
	},
	testPuckerMatch: function() {
		// select points over the edges of canny

		var cloud = [];
		for(i = 0; i < this.point_count; ++i) {
			if(!this.point_status[i]) continue;
			var point = {
				x:this.curr_xy[i<<1], 
				y:this.curr_xy[(i<<1)+1]
			};
			cloud.push(point);
		}

		var min_points = 9;
		if(cloud.length > min_points) {
			var convexhull = ConvexHull.get(cloud);
			if(convexhull.length > min_points) {
				this.convexhull = convexhull;
			}
		}

		var score = 0;
		if(this.convexhull.length) {

			var min_scale = 0.4;
			var max_scale = 1;
			var scale = Math.random()*(max_scale - min_scale) + min_scale;
			min_scale = 0.4;

			var n = this.convexhull.length;
			var cx = this.mouth.x + this.mouth.width/2;
			var cy = this.mouth.y + this.mouth.height/2;

			var x0 = this.width-1;
			var y0 = this.height-1;
			var x1 = 0;
			var y1 = 0;

			for(i=0; i < n; i++ ) {
				var x = Math.round((this.convexhull[i][0].x - cx)*scale+cx),
					y = Math.round((this.convexhull[i][0].y - cy)*scale+cy);

				if(x < x0) x0 = x;
				if(y < y0) y0 = y;
				if(x > x1) x1 = x;
				if(y > y1) y1 = y;
			}

			var step = 2;
			var border = 2*step;
			var roi = {
				x: x0-(border+1),
				y: y0-(border+1),
				width: (x1-x0)+(border+1)*2,
				height: (y1-y0)+(border+1)*2
			};

			var smallImageData, small_img_u8;
			if(roi.width == 0 || roi.height == 0) return 0;
			smallImageData = this.webcamCanvasCtx.getImageData( roi.x, roi.y, roi.width, roi.height );
			small_img_u8 = new jsfeat.matrix_t(roi.width, roi.height, jsfeat.U8_t | jsfeat.C1_t);

			jsfeat.imgproc.grayscale(smallImageData.data, small_img_u8.data);
			jsfeat.imgproc.equalize_histogram(small_img_u8, small_img_u8);
			jsfeat.imgproc.gaussian_blur(small_img_u8, small_img_u8, 24, 0);
			jsfeat.imgproc.canny(small_img_u8, small_img_u8, 16, 64);
			jsfeat.imgproc.gaussian_blur(small_img_u8, small_img_u8, 32, 2);


			// find contour
			var contour = [];
			if(this.debug > 0) {
				this.lipCanvasCtx.globalAlpha = 1;
				this.lipCanvasCtx.strokeStyle = "red";
				this.lipCanvasCtx.beginPath();
			}
			for(i=0; i < n; i++ ) {
				var x = Math.round((this.convexhull[i][0].x - cx)*scale+cx),
					y = Math.round((this.convexhull[i][0].y - cy)*scale+cy);

				var x_in = Math.round((this.convexhull[i][0].x - cx)*min_scale+cx),
					y_in = Math.round((this.convexhull[i][0].y - cy)*min_scale+cy);

				var p = {x:x, y:y, score:0, dist:this.width+this.height};
				for(var dx = -border; dx <= +border; dx+=step) {
					for(var dy = -border; dy <= +border; dy+=step) {
						var dp = this.highLine(small_img_u8, dx+x-roi.x, dy+y-roi.y, dx+x_in-roi.x, dy+y_in-roi.y);
						if(dp.score/(1+dp.dist) > p.score/(1+p.dist)) p = dp;
					}
				}

				p.x += roi.x;
				p.y += roi.y;

				contour.push(p);

				if(this.debug > 0) {
					if(!i) this.lipCanvasCtx.moveTo(p.x,p.y);
					else this.lipCanvasCtx.lineTo(p.x,p.y);
				}
			}

			if(this.debug > 0) {
				this.lipCanvasCtx.closePath();
				this.lipCanvasCtx.stroke();
			}


			// rank contour

			var last_x = contour[0].x, last_y = contour[0].y;

			for(i=1; i < contour.length; i++ ) {
				var x = contour[i].x;
				var y = contour[i].y;

				score += this.sumLine(small_img_u8, 
					last_x-roi.x, 
					last_y-roi.y, 
					x-roi.x, 
					y-roi.y
				);
			}
			score /= (contour.length-1);


			if(this.debug > 0) {
				this.lipCanvasCtx.globalAlpha = 1;
				this.lipCanvasCtx.putImageData(smallImageData, 0, this.height-smallImageData.height);

				var small_img_u32 = new Uint32Array(smallImageData.data.buffer);
				var alpha = (0xff << 24);
				var i = small_img_u8.cols*small_img_u8.rows, pix = 0;
				while(--i >= 0) {
					pix = small_img_u8.data[i];
					small_img_u32[i] = alpha | (pix << 16) | (pix << 8) | pix;
				}
				this.lipCanvasCtx.putImageData(smallImageData, smallImageData.width, this.height-smallImageData.height);


				jsfeat.imgproc.equalize_histogram(small_img_u8, small_img_u8);
				var i = small_img_u8.cols*small_img_u8.rows, pix = 0;
				while(--i >= 0) {
					pix = small_img_u8.data[i];
					small_img_u32[i] = alpha | (pix << 16) | (pix << 8) | pix;
				}
				this.lipCanvasCtx.putImageData(smallImageData, smallImageData.width*2, this.height-smallImageData.height);


				var last_x = contour[0].x, last_y = contour[0].y;

				this.lipCanvasCtx.globalAlpha = 1;
				this.lipCanvasCtx.strokeStyle = "red";
				this.lipCanvasCtx.beginPath();
				this.lipCanvasCtx.moveTo(
					last_x-roi.x+smallImageData.width*2, 
					last_y-roi.y+this.height-smallImageData.height
					);

				for(i=1; i < contour.length; i++ ) {
					var x = contour[i].x;
					var y = contour[i].y;

					this.lipCanvasCtx.lineTo(
						x-roi.x+smallImageData.width*2, 
						y-roi.y+this.height-smallImageData.height
					);
				}

				this.lipCanvasCtx.closePath();
				this.lipCanvasCtx.stroke();

			}

			score /= (1+this.motion);


			if(score > this.top_score) {
				this.top_score = score;
				this.top_contour = contour;
				this.top_canny = smallImageData;
				this.top_webcam = this.webcamCanvasCtx.getImageData( 0, 0, this.width, this.height);
				this.top_roi = roi;
				this.top_countdown = this.top_countdown_max;
			}
		}

/////////////////// draw top contour
		if(this.top_contour[0] && this.top_canny) {
			
			last_x = this.top_contour[0].x, last_y = this.top_contour[0].y;

			if(this.debug > 0) {
				this.lipCanvasCtx.globalAlpha = 1;
				this.lipCanvasCtx.putImageData(this.top_canny, this.width-this.top_canny.width, this.height-this.top_canny.height);
				this.lipCanvasCtx.strokeStyle = "magenta";
				this.lipCanvasCtx.beginPath();
				this.lipCanvasCtx.moveTo(
					last_x-this.top_roi.x+this.width-this.top_canny.width, 
					last_y-this.top_roi.y+this.height-this.top_canny.height
				);

			}

			for(i=1; i < this.top_contour.length; i++ ) {
				var x = this.top_contour[i].x;
				var y = this.top_contour[i].y;

				if(this.debug > 0) {
					this.lipCanvasCtx.lineTo(
						x-this.top_roi.x+this.width-this.top_canny.width, 
						y-this.top_roi.y+this.height-this.top_canny.height
					);
				}
			}

			if(this.debug > 0) {
				this.lipCanvasCtx.closePath();
				this.lipCanvasCtx.stroke();
			}

/// draw top contour on scene /// debug // remove
				this.lipCanvasCtx.globalAlpha = 0.3;
				this.lipCanvasCtx.fillStyle = "magenta";
				this.lipCanvasCtx.beginPath();

				for(i=0; i < this.top_contour.length; i++ ) {
					var x = this.top_contour[i].x;
					var y = this.top_contour[i].y;

					if(!i) this.lipCanvasCtx.moveTo(x,y);
					else this.lipCanvasCtx.lineTo(x,y);
				}

				this.lipCanvasCtx.closePath();
				this.lipCanvasCtx.fill();

		}

///////////////////////

		console.log(score, this.top_score, this.top_countdown, this.motion);
		return this.top_countdown-- < 0;
	},

	drawRectangle: function (ctx, rect, color) {
		if(this.debug > 1 && rect) {
			ctx.globalAlpha = 1;
			ctx.strokeStyle = color;
			ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
		}
	},
	trackMouthModel:function(mouth){
		var imageData, _pt_xy, _pyr;

		_pt_xy = this.prev_xy;
		this.prev_xy = this.curr_xy;
		this.curr_xy = _pt_xy;
		_pyr = this.prev_img_pyr;
		this.prev_img_pyr = this.curr_img_pyr;
		this.curr_img_pyr = _pyr;

		imageData = this.webcamCanvasCtx.getImageData( 0, 0, this.width, this.height);
		jsfeat.imgproc.grayscale(imageData.data, this.curr_img_pyr.data[0].data);
		this.curr_img_pyr.build(this.curr_img_pyr.data[0], true);
		jsfeat.optical_flow_lk.track(this.prev_img_pyr, this.curr_img_pyr, this.prev_xy, this.curr_xy,
			this.point_count, this.win_size|0, this.max_iterations|0, this.point_status, this.epsilon, this.min_eigen);

		this.point_count = this.cleanupOpticalFlow(this.lipCanvasCtx, this.point_count, mouth);
	},
	getLowerFaceArea:function(face){
		var area = {y: Math.round(this.height * 0.3), 
					height: Math.round(this.height * 0.5),
					x: Math.round(this.width * 0.25), 
					width: Math.round(this.width * 0.5)};
		if(face){
			area.y      = Math.round(face.y + face.height * 0.6);
			area.height = Math.round(face.height * 0.55);
			area.x      = Math.round(face.x + face.width * 0.1);
			area.width  = Math.round(face.width * 0.8);
		}
		return area;
	},
	getUpperFaceArea:function(face){
		var area = null;
		if(face){
			area = {y: Math.round(face.y),
					x: Math.round(face.x - face.width * 0.1), 
					width: Math.round(face.width * 1.2),
					height: Math.round(face.height * 0.4)};
		}
		return area;
	},
	getEyeArea:function(face){
		var area = {x: Math.round(this.width * 0.1), y:0, 
					width: Math.round(this.width * .8), 
					height: Math.round(this.height * .6)};
		if(face){
			area.x = Math.round(face.x);
			area.y = Math.round(face.y); 
			area.width = Math.round(face.width); 
			area.height = Math.round(face.y + face.height * 0.5);
		}
		return area;
	},
	getMouthArea:function(face, lowerFace, mouth){
		var area = mouth;
		if(face && !area) {
			// Creating mouth position based on face
			area = {
				confidence: 0.5, 
				y: Math.round(lowerFace.y + lowerFace.height * 0.2),
				height: Math.round(lowerFace.height * 0.75),
				x: Math.round(lowerFace.x + lowerFace.width * 0.2),
				width: Math.round(lowerFace.width * 0.6)
			};
		}
		if(area) {
			area.y = Math.round(area.y - area.height * 0.4);
			area.height = Math.round(area.height * 1.45);
			area.x = Math.round(area.x);
			area.width = Math.round(area.width);
		}
		return area;
	},
	isIntersected:function(a, b){
		return !(a.x > b.x + b.width || a.x + a.width < b.x || 
				a.y > b.y + b.height || a.y + a.height < b.y);
	},
	getFeatures:function(canvasCtx, corners, mouth, laplacian){
		var smallImageData, small_img_u8, count, delta;
		this.drawRectangle(this.lipCanvasCtx, mouth, "magenta");

		smallImageData = canvasCtx.getImageData( mouth.x, mouth.y, mouth.width, mouth.height );
		small_img_u8 = new jsfeat.matrix_t(mouth.width, mouth.height, jsfeat.U8_t | jsfeat.C1_t);

		jsfeat.imgproc.grayscale(smallImageData.data, small_img_u8.data);
		jsfeat.imgproc.equalize_histogram(small_img_u8, small_img_u8);
		jsfeat.imgproc.box_blur_gray(small_img_u8, small_img_u8, 4, 0);
		jsfeat.yape06.laplacian_threshold = laplacian;
		jsfeat.yape06.min_eigen_value_threshold = 1;

		count = jsfeat.yape06.detect(small_img_u8, corners);
		delta = 0;
		if(count > 50) delta = 1;
		if(count < 10) delta = -1;

		if(this.debug > 0) {
			this.lipCanvasCtx.globalAlpha = 1;
			this.lipCanvasCtx.putImageData(smallImageData, 0, 0);

			var small_img_u32 = new Uint32Array(smallImageData.data.buffer);
			var alpha = (0xff << 24);
			var i = small_img_u8.cols*small_img_u8.rows, pix = 0;
			while(--i >= 0) {
				pix = small_img_u8.data[i];
				small_img_u32[i] = alpha | (pix << 16) | (pix << 8) | pix;
			}

			this.lipCanvasCtx.putImageData(smallImageData, smallImageData.width, 0);
		}


		return {
			laplacian: Math.min(100, Math.max(1, laplacian + delta)),
			corners: corners,
			count: count
		};
	},
	getEyesAndUpperFaceUnionArea:function(eyes, face, upperFace, groupArea){
		var i, count = 0, 
			revert = { x:0, y:0, width:this.width, height:0 },
			union = {x0:this.width, y0:this.height, x1:-1, y1:-1};
			
		if(eyes.length > 0) {
			for(i=0; i< Math.min(2,eyes.length); i++) {
				this.drawRectangle(this.lipCanvasCtx, eyes[i], "cyan");
				if(eyes[i].x < union.x0) union.x0 = eyes[i].x;
				if(eyes[i].y < union.y0) union.y0 = eyes[i].y;
				if(eyes[i].x + eyes[i].width > union.x1) union.x1 = eyes[i].x+eyes[i].width;
				if(eyes[i].y + eyes[i].height > union.y1) union.y1 = eyes[i].y+eyes[i].height;
				count++;
			}
			
		}

		if(face) {
			if(upperFace.x < union.x0) union.x0 = upperFace.x;
			if(upperFace.y < union.y0) union.y0 = upperFace.y;
			if(upperFace.x + upperFace.width > union.x1) union.x1 = upperFace.x + upperFace.width;
			if(upperFace.y + upperFace.height > union.y1) union.y1 = upperFace.y + upperFace.height;
			count++;
		}

		if(count) {
			groupArea.x = groupArea.x * 0.90 + union.x0 * 0.10;
			groupArea.y = groupArea.y * 0.90 + union.y0 * 0.10;
			groupArea.width = groupArea.width * 0.90 + (union.x1 - union.x0) * 0.10;
			groupArea.height = groupArea.height * 0.90 + (union.y1 - union.y0) * 0.10;
		}
		
		groupArea.x = groupArea.x * 0.99 + revert.x * 0.01;
		groupArea.y = groupArea.y * 0.99 + revert.y * 0.01;
		groupArea.width = groupArea.width * 0.99 + revert.width * 0.01;
		groupArea.height = groupArea.height * 0.99 + revert.height * 0.01;

		return groupArea;
	},
	getDistance:function(a, b){
		return Math.sqrt( Math.pow( a.x - b.x, 2) + Math.pow(a.y - b.y, 2) );
	},
	processFeatures:function(mouth, corners, countCorners, callback){
		var point, centerMouth, max_dist, centralized, score, i, j, k, dist;
		centerMouth = {x: mouth.width / 2.0, y: mouth.height / 2.0};
		max_dist = centerMouth.y;

		if(this.debug > 0) {
			this.lipCanvasCtx.strokeStyle = "white";
		}

		var median = 0;
		for(i = 0; i < countCorners; i++ ) {
			median += corners[i].y;
		}
		median /= countCorners;
		
		//corners.sort(function(a,b) { return a.x-b.x; })
	
		var selected = [];
		for(i = 0; i < countCorners; i++ ) {
			score = Math.min(1, corners[i].score / 32.0);
			dist = this.getDistance(corners[i], centerMouth);
			centralized = 1-Math.pow(Math.min(dist, max_dist) / max_dist, 1.1);
			aligned = 1-(Math.abs(corners[i].y - median) / max_dist);
			point = {
				x: corners[i].x + mouth.x,
				y: corners[i].y + mouth.y,
				prio: score * centralized * aligned
				//prio: centralized * aligned
			};
			if(this.debug > 0) {
				this.lipCanvasCtx.globalAlpha = point.prio;
				this.lipCanvasCtx.strokeRect(point.x, point.y, 1, 1);
			}

			if(point.prio > 0.0) {
				selected.push(point);
			}

		}

		// match feature points to the base shape vertexes
		var convexhull = ConvexHull.get(selected);

		for(i=0; i < convexhull.length; i++ ) {
			if(this.point_count < this.point_max_count) { 
				// only track the vertexes of the base shape
				this.curr_xy[ this.point_count<<1]    = convexhull[i][0].x + Math.random()*3-1;
				this.curr_xy[(this.point_count<<1)+1] = convexhull[i][0].y + Math.random()*3-1;
				this.point_count++;
			}
		}

		if(this.debug > 1) {
			this.lipCanvasCtx.globalAlpha = 1;
			this.lipCanvasCtx.strokeStyle = "yellow";

			this.lipCanvasCtx.beginPath();
			i=0;
			this.lipCanvasCtx.moveTo(convexhull[i][0].x, convexhull[i][0].y);
			for(i++; i < convexhull.length; i++ ) {
				this.lipCanvasCtx.lineTo(convexhull[i][1].x, convexhull[i][1].y);
			}
			this.lipCanvasCtx.closePath();
			this.lipCanvasCtx.stroke();
		}

	},
	matchMouthModel:function(mouth){
		var self = this, features, intersect;
		if(!mouth) return;
		this.confidence = this.confidence * 0.9 + mouth.confidence * 0.1;
		intersect = this.isIntersected(this.block, mouth);
		if(mouth.confidence + 0.25 >= this.confidence && !intersect) {
			this.drawRectangle(this.lipCanvasCtx, mouth, "magenta");
			features = this.getFeatures(this.webcamCanvasCtx, this.corners, mouth, this.laplacian);
			this.laplacian = features.laplacian;
			this.corners = features.corners;
			this.processFeatures(mouth, this.corners, features.count);
		} else {
			//console.log("failed: " + mouth.confidence +  " >= " + this.confidence + " && "+ (!intersect));
		}
	},
    tick:function(){
    	var face, lower_face, upper_face, eye_mask, work, mouth, eyes;
        this._interval = compatibility.requestAnimationFrame(function(){
			LipDetector.tick();
        });

		if(this.pause) {
			this.lipCanvasCtx.globalAlpha = 1;
			this.lipCanvasCtx.putImageData(this.top_webcam, 0,0);

			this.lipCanvasCtx.globalAlpha = 0.3;
			this.lipCanvasCtx.fillStyle = "magenta";
			this.lipCanvasCtx.beginPath();

			for(i=0; i < this.top_contour.length; i++ ) {
				var x = this.top_contour[i].x;
				var y = this.top_contour[i].y;

				if(!i) this.lipCanvasCtx.moveTo(x,y);
				else this.lipCanvasCtx.lineTo(x,y);
			}

			this.lipCanvasCtx.closePath();
			this.lipCanvasCtx.fill();
			return;
		}

        if (this.webcam.readyState === this.webcam.HAVE_ENOUGH_DATA || this.useImage) {
			this.debugPos = 0;
			this.lipCanvasCtx.clearRect(0, 0, this.width, this.height);
			this.webcamCanvasCtx.globalAlpha = 0.75;
			this.webcamCanvasCtx.drawImage(this.webcam, 0, 0, this.width, this.height);
			this.webcamCanvasCtx.globalAlpha = 1;

			face = this.haar(jsfeat.haar.frontalface, this.webcam)[0];
			this.drawRectangle(this.lipCanvasCtx, face, "red");

			lower_face = this.getLowerFaceArea(face);
			upper_face = this.getUpperFaceArea(face);
			eye_mask = this.getEyeArea(face);
			work = face ? this.small_work_area: this.large_work_area;

			this.drawRectangle(this.lipCanvasCtx, lower_face, "green");
			this.drawRectangle(this.lipCanvasCtx, eye_mask, "white");

			mouth = this.haar(jsfeat.haar.mouth, this.webcam, lower_face, work)[0];
			mouth = this.getMouthArea(face, lower_face, mouth);
			this.drawRectangle(this.lipCanvasCtx, mouth, this.color);

			eyes = this.haar(jsfeat.haar.eye, this.webcam, eye_mask, this.large_work_area);

			this.block = this.getEyesAndUpperFaceUnionArea(eyes, face, upper_face, this.block);
			this.drawRectangle(this.lipCanvasCtx, this.block, "black");

			this.matchMouthModel(mouth);
			this.trackMouthModel(mouth);
			this.drawOpticalFlow(this.lipCanvasCtx);

			if(this.testPuckerMatch()) {
				console.log("done")
				this.pause = true;

			}
        }
    },
    captureLips:function(){

    },
    getLips:function(){
        return null;
    }, 
    stop:function () {
        compatibility.cancelAnimationFrame(this._interval);
    }
}  

