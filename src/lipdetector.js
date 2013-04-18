var LipDetector = {
	create_work_area: function(max_work_size) {
		var that = {};
		that.scale = Math.min(max_work_size/this.width, max_work_size/this.height);
		var w = (this.width*that.scale)|0;
		var h = (this.height*that.scale)|0;
		that.canvas = document.createElement('canvas');
		that.canvas.width = w;
		that.canvas.height = h;
		that.ctx = that.canvas.getContext('2d');
		// document.firstChild.appendChild(that.canvas);

		that.img_u8 = new jsfeat.matrix_t(w, h, jsfeat.U8_t | jsfeat.C1_t);
		that.ii_sum = new Int32Array((w+1)*(h+1));
		that.ii_sqsum = new Int32Array((w+1)*(h+1));
		that.ii_tilted = new Int32Array((w+1)*(h+1));

		return that;
	},

    init:function(webcam, webcamCanvas, lipCanvas){
		this.debug = 1;

        this.webcam = webcam;
        this.webcamCanvas = webcamCanvas;
        this.lipCanvas = lipCanvas;
        this.webcamCanvasCtx = this.webcamCanvas.getContext('2d');
        this.lipCanvasCtx = this.lipCanvas.getContext('2d');
        this.useImage = false;

		this.width = this.webcam.videoWidth;
		this.height = this.webcam.videoHeight;

		//this.webcamCanvasCtx.scale(-1,1);
		//this.webcamCanvasCtx.translate(-this.width,0);
		//this.lipCanvasCtx.scale(-1,1);
		//this.lipCanvasCtx.translate(-this.width,0);

		this.small_work_area = this.create_work_area(100);
		this.large_work_area = this.create_work_area(200);

		this.corners = [];
		for(var i = 0; i < this.width * this.height; i++) {
			this.corners[i] = new jsfeat.point2d_t(0,0,0,0);
		}

		this.edges_density = 0.13;
		this.scale_factor = 1.1;
		this.min_scale = 2;
		this.use_tilted = true;

		this.laplacian = 16;
		this.confidence = 0.5;
		this.color = "black";
		this.block = { x:0, y:0, width:this.width, height:0 };
    },

	haar:function(classifier, image, roi, work){
		if(!work) work = this.small_work_area;

		if(roi) {
			this.color = "blue";
		} else {
			roi = {x:0, y:0, width:this.width, height:this.height};
			this.color = "yellow";
		}

		work.ctx.drawImage(image, roi.x, roi.y, roi.width, roi.height, 0, 0, work.canvas.width, work.canvas.height);
		var imageData = work.ctx.getImageData( 0,0, work.canvas.width,work.canvas.height);

		jsfeat.imgproc.grayscale(imageData.data, work.img_u8.data);

		// jsfeat.imgproc.equalize_histogram(work.img_u8, work.img_u8); // equalize_histogram

		jsfeat.imgproc.compute_integral_image(work.img_u8, work.ii_sum, work.ii_sqsum, this.use_tilted && classifier.tilted ? work.ii_tilted : null);

		jsfeat.haar.edges_density = this.edges_density;
		var rects = jsfeat.haar.detect_multi_scale(work.ii_sum, work.ii_sqsum, work.ii_tilted, null, work.img_u8.cols, work.img_u8.rows, classifier, this.scale_factor, this.min_scale);
		rects = jsfeat.haar.group_rectangles(rects, 1);

		jsfeat.math.qsort(rects, 0, rects.length-1, function(a,b){return (b.confidence<a.confidence);})

		for(var i in rects) {
			var unscale = 
			rects[i].x = rects[i].x * roi.width/work.canvas.width + roi.x;
			rects[i].y = rects[i].y * roi.height/work.canvas.height + roi.y;
			rects[i].width  *= roi.width/work.canvas.width;
			rects[i].height *= roi.height/work.canvas.height;
		}

		if(this.debug > 2) {
			this.debugPos += work.canvas.width;
			this.lipCanvasCtx.putImageData( imageData, this.width-this.debugPos,0, 0,0, work.canvas.width, work.canvas.height);
		}

		return rects;
	},

	 draw_match: function (ctx, r, color) {
		 if(this.debug > 1 && r) {
			ctx.strokeStyle = color;
			ctx.strokeRect(r.x,r.y,r.width,r.height);
		 }
	},

    tick:function(){
        this._interval = compatibility.requestAnimationFrame(function(){
            LipDetector.tick();
        });

        if (this.webcam.readyState === this.webcam.HAVE_ENOUGH_DATA || this.useImage) {
			this.debugPos = 0;
			this.lipCanvasCtx.clearRect(0, 0, this.width,this.height);

			this.webcamCanvasCtx.globalAlpha = 0.75;
			this.webcamCanvasCtx.drawImage(this.webcam, 0, 0, this.width, this.height);
			this.webcamCanvasCtx.globalAlpha = 1;

			var face = this.haar(jsfeat.haar.frontalface, this.webcam)[0];
			this.draw_match(this.lipCanvasCtx, face, "red");

			var lower_face;
			var upper_face;
			var eye_mask = { x:this.width*0.1, y:0, width:this.width*.8, height:this.height*.6 };
			var work = this.small_work_area;
			if(face) {
				lower_face = {};
				lower_face.y      = face.y + face.height*0.6;
				lower_face.height = face.height * 0.4;
				lower_face.x      = face.x + face.width*0.1;
				lower_face.width  = face.width*0.8;

				upper_face = {};
				upper_face.y      = face.y;
				upper_face.height = face.height*0.4;
				upper_face.x      = face.x - face.width*0.1;
				upper_face.width  = face.width * 1.2;

				eye_mask = { x:face.x, y:face.y, width:face.width, height:face.y+face.height*0.5 };
			} else {
				lower_face = {};
				lower_face.y      = this.height*0.3;
				lower_face.height = this.height*0.5;
				lower_face.x      = this.width*0.2;
				lower_face.width  = this.width*0.6;
				work = this.large_work_area;
			}
			this.draw_match(this.lipCanvasCtx, lower_face, "green");
			this.draw_match(this.lipCanvasCtx, eye_mask, "white");

			var mouth = this.haar(jsfeat.haar.mouth, this.webcam, lower_face, work)[0];
			if(face) {
				if(!mouth) { // XXX creating mouth position based on face
					mouth =  {confidence:0.5};
					mouth.y = lower_face.y + lower_face.height * 0.2;
					mouth.height = lower_face.height * 0.75;
					mouth.x = lower_face.x + lower_face.width * 0.2;
					mouth.width = lower_face.width * 0.6;
				}
			}
			if(mouth) {
				mouth.y -= mouth.height*0.4;
				mouth.height *= 1.45;

				mouth.x = Math.round(mouth.x);
				mouth.y = Math.round(mouth.y);
				mouth.width = Math.round(mouth.width);
				mouth.height = Math.round(mouth.height);
			}
			this.draw_match(this.lipCanvasCtx, mouth, this.color);

			var union_count = 0;
			var union = { x0:this.width, y0:this.height, x1:-1, y1:-1 };
			var eyes = this.haar(jsfeat.haar.eye, this.webcam, eye_mask, this.large_work_area);
			if(eyes.length > 0) {
				for(var i in eyes) {
					this.draw_match(this.lipCanvasCtx, eyes[i], "cyan");
					if(eyes[i].x < union.x0) union.x0 = eyes[i].x;
					if(eyes[i].y < union.y0) union.y0 = eyes[i].y;
					if(eyes[i].x+eyes[i].width > union.x1) union.x1 = eyes[i].x+eyes[i].width;
					if(eyes[i].y+eyes[i].height > union.y1) union.y1 = eyes[i].y+eyes[i].height;
					union_count++;
				}
				
			}

			if(face) {
				if(upper_face.x < union.x0) union.x0 = upper_face.x;
				if(upper_face.y < union.y0) union.y0 = upper_face.y;
				if(upper_face.x+upper_face.width > union.x1)  union.x1 = upper_face.x+upper_face.width;
				if(upper_face.y+upper_face.height > union.y1) union.y1 = upper_face.y+upper_face.height;
				union_count++;
			}

			if(union_count) {
				this.block.x = this.block.x * 0.90 + union.x0 * 0.10;
				this.block.y = this.block.y * 0.90 + union.y0 * 0.10;
				this.block.width = this.block.width * 0.90 + (union.x1-union.x0) * 0.10;
				this.block.height = this.block.height * 0.90 + (union.y1-union.y0) * 0.10;
			}

			var revert = { x:0, y:0, width:this.width, height:0 };
			this.block.x = this.block.x * 0.99 + revert.x * 0.01;
			this.block.y = this.block.y * 0.99 + revert.y * 0.01;
			this.block.width = this.block.width * 0.99 + revert.width * 0.01;
			this.block.height = this.block.height * 0.99 + revert.height * 0.01;

			this.draw_match(this.lipCanvasCtx, this.block, "black");

			if(mouth) {
				this.confidence = this.confidence * 0.9 + mouth.confidence * 0.1;
				var intersect = !(this.block.x > mouth.x+mouth.width || 
							   this.block.x+this.block.width < mouth.x || 
							   this.block.y > mouth.y+mouth.height ||
							   this.block.y+this.block.height < mouth.y);
				if(mouth.confidence+0.25 >= this.confidence && !intersect) {
					this.draw_match(this.lipCanvasCtx, mouth, "magenta");


					// XXX god help us

					// FIXME not always aligned  (diagonal lines)
					var smallImageData = this.webcamCanvasCtx.getImageData( mouth.x, mouth.y, mouth.width, mouth.height );
					//var smallImageData = this.webcamCanvasCtx.getImageData( this.width-mouth.width-mouth.x, mouth.y, mouth.width, mouth.height );
					var small_img_u8 = new jsfeat.matrix_t(mouth.width, mouth.height, jsfeat.U8_t | jsfeat.C1_t);

					if(this.debug > 0) this.lipCanvasCtx.putImageData( smallImageData, 0,0, 0,0, mouth.width, mouth.height);

					jsfeat.imgproc.grayscale(smallImageData.data, small_img_u8.data);

					jsfeat.imgproc.box_blur_gray(small_img_u8, small_img_u8, 4, 0); // XXX ??
					jsfeat.imgproc.equalize_histogram(small_img_u8, small_img_u8);


					jsfeat.yape06.laplacian_threshold = this.laplacian;
					jsfeat.yape06.min_eigen_value_threshold = 1;

					var count = jsfeat.yape06.detect(small_img_u8, this.corners);

					var delta = 0;
					if(count > 50) delta = 1;
					if(count < 10) delta = -1;
					this.laplacian = Math.min(100,Math.max(1,this.laplacian+delta));
			

					this.lipCanvasCtx.strokeStyle = "white";
					var cx = mouth.width/2.;
					var cy = mouth.height/2.;
					var md = cy;
					for(var i=0; i<count; i++ ) {
						var d = Math.sqrt(Math.pow(this.corners[i].x-cx,2)+Math.pow(this.corners[i].y-cy,2));
						if(this.debug > 0) {
							var center = 1-Math.pow(Math.min(d,md)/md,1.1);
							var score = Math.min(1,this.corners[i].score/64.);
							this.lipCanvasCtx.globalAlpha = center*score;
							this.lipCanvasCtx.strokeRect(mouth.x+this.corners[i].x,mouth.y+this.corners[i].y, 1,1);
						}
					}
					this.lipCanvasCtx.globalAlpha = 1;


				} else {
					//console.log("failed: " + mouth.confidence +  " >= " + this.confidence + " && "+ (!intersect));
				}
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

