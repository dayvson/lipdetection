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
	},
	createWorkArea: function(maxWorkSize, width, height) {
		var  workArea = {}, h, w;
		workArea.scale = Math.min(maxWorkSize/width, maxWorkSize/height);
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
		this.epsilon = 0;
		this.min_eigen = 0;

		this.curr_img_pyr = new jsfeat.pyramid_t(3);
		this.prev_img_pyr = new jsfeat.pyramid_t(3);
		this.curr_img_pyr.allocate(this.width, this.height, jsfeat.U8_t|jsfeat.C1_t);
		this.prev_img_pyr.allocate(this.width, this.height, jsfeat.U8_t|jsfeat.C1_t);

		this.point_max_count = 100;
		this.point_count = 0;
		this.point_status = new Uint8Array(this.point_max_count);
		this.prev_xy = new Float32Array(this.point_max_count * 2);
		this.curr_xy = new Float32Array(this.point_max_count * 2);
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

		//this.webcamCanvasCtx.scale(-1,1);
		//this.webcamCanvasCtx.translate(-this.width,0);
		//this.lipCanvasCtx.scale(-1,1);
		//this.lipCanvasCtx.translate(-this.width,0);

		this.small_work_area = this.createWorkArea(100, this.width, this.height);
		this.large_work_area = this.createWorkArea(200, this.width, this.height);
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
	drawOpticalFlowPoints: function(ctx, totalPoints) {
		var i = 0, j = 0;
		for(i; i < totalPoints; ++i) {
			if(this.point_status[i] == 1) {
				if(j < i) {
					this.curr_xy[j<<1] = this.curr_xy[i<<1];
					this.curr_xy[(j<<1) + 1] = this.curr_xy[(i<<1) + 1];
				}
				ctx.strokeStyle = 'yellow';
				ctx.strokeRect(this.curr_xy[j<<1]-1, this.curr_xy[(j<<1)+1]-1, 3, 3);
				++j;
			}
		}
		return j;
	},

	drawRectangle: function (ctx, rect, color) {
		if(this.debug > 1 && rect) {
			ctx.strokeStyle = color;
			ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
		}
	},
	renderOpticalFlow:function(){
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

		this.point_count = this.drawOpticalFlowPoints(this.lipCanvasCtx, this.point_count);
	},
	getLowerFaceArea:function(face){
		var area = {y: Math.round(this.height * 0.3), 
					height: Math.round(this.height * 0.5),
					x: Math.round(this.width * 0.2), 
					width: Math.round(this.width * 0.6)};
		if(face){
			area.y      = Math.round(face.y + face.height * 0.6);
			area.height = Math.round(face.height * 0.4);
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
		//var smallImageData = this.webcamCanvasCtx.getImageData( this.width-mouth.width-mouth.x, mouth.y, mouth.width, mouth.height );
		small_img_u8 = new jsfeat.matrix_t(mouth.width, mouth.height, jsfeat.U8_t | jsfeat.C1_t);

		if(this.debug > 0) {
			this.lipCanvasCtx.putImageData(smallImageData, 0, 0, 0, 0, mouth.width, mouth.height);
		}

		jsfeat.imgproc.grayscale(smallImageData.data, small_img_u8.data);
		jsfeat.imgproc.box_blur_gray(small_img_u8, small_img_u8, 4, 0); // XXX ??
		jsfeat.imgproc.equalize_histogram(small_img_u8, small_img_u8);
		jsfeat.yape06.laplacian_threshold = laplacian;
		jsfeat.yape06.min_eigen_value_threshold = 1;

		count = jsfeat.yape06.detect(small_img_u8, corners);
		delta = 0;
		if(count > 50) delta = 1;
		if(count < 10) delta = -1;

		return {
			laplacian: Math.min(100, Math.max(1, laplacian + delta)),
			corners: corners,
			count: count
		};
	},
	getEyesAndUpperFaceUnionArea:function(eyes, face, upperFace, groupArea){
		var count = 0, 
			revert = { x:0, y:0, width:this.width, height:0 },
			union = {x0:this.width, y0:this.height, x1:-1, y1:-1};
			
		if(eyes.length > 0) {
			for(var i in eyes) {
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
	drawFeatures:function(mouth, corners, countCorners, callback){
		var centerMouth, md, center, score, prio, i = 0, dis;
		centerMouth = {x: mouth.width / 2.0, y: mouth.height / 2.0};
		md = centerMouth.y;
		for(i; i < countCorners; i++ ) {
			dis = this.getDistance(corners[i], centerMouth);
			center = 1-Math.pow(Math.min(dis, md) / md, 1.1);
			score = Math.min(1, corners[i].score / 64.0);
			prio = center * score;
			if(this.debug > 0) {
				this.lipCanvasCtx.globalAlpha = prio;
				this.lipCanvasCtx.strokeRect(mouth.x + corners[i].x, mouth.y + corners[i].y, 1, 1);
			}
			callback(prio, score, mouth, corners[i]);
		}
		this.lipCanvasCtx.globalAlpha = 1;
	},
	drawMouthPoints:function(mouth){
		var self = this, features, intersect;
		this.confidence = this.confidence * 0.9 + mouth.confidence * 0.1;
		intersect = this.isIntersected(this.block, mouth);
		if(mouth.confidence + 0.25 >= this.confidence && !intersect) {
			this.drawRectangle(this.lipCanvasCtx, mouth, "magenta");
			features = this.getFeatures(this.webcamCanvasCtx, this.corners, mouth, this.laplacian);
			this.laplacian = features.laplacian;
			this.corners = features.corners;
			this.lipCanvasCtx.strokeStyle = "white";
			this.drawFeatures(mouth, this.corners, features.count, function(prio, score, mouth, corner){
				if(prio > 0.90 && self.point_count < self.point_max_count) { 
					// TODO match feature points to the base shape vertexes
					// TODO only track the vertexes of the base shape
					self.curr_xy[self.point_count<<1] = mouth.x + corner.x;
					self.curr_xy[(self.point_count<<1)+1] = mouth.y + corner.y;
					self.point_count++;
				}
			});
		} else {
			//console.log("failed: " + mouth.confidence +  " >= " + this.confidence + " && "+ (!intersect));
		}
		this.renderOpticalFlow();
	},
    tick:function(){
    	var face, lower_face, upper_face, eye_mask, work, mouth, eyes;
        this._interval = compatibility.requestAnimationFrame(function(){
            LipDetector.tick();
        });

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

			this.drawMouthPoints(mouth);
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

