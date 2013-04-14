var LipDetector = {
    init:function(webcam, webcamCanvas, lipCanvas){
		this.debug = false;

        this.webcam = webcam;
        this.webcamCanvas = webcamCanvas;
        this.lipCanvas = lipCanvas;
        this.webcamCanvasCtx = this.webcamCanvas.getContext('2d');
        this.lipCanvasCtx = this.lipCanvas.getContext('2d');
        this.useImage = false;

		this.width = this.webcam.videoWidth;
		this.height = this.webcam.videoHeight;
		var max_work_size = 200;

		this.scale = Math.min(max_work_size/this.width, max_work_size/this.height);
		var w = (this.width*this.scale)|0;
		var h = (this.height*this.scale)|0;
		this.work_canvas = document.createElement('canvas');
		this.work_canvas.width = w;
		this.work_canvas.height = h;
		this.work_ctx = this.work_canvas.getContext('2d');
		document.firstChild.appendChild(this.work_canvas);

		this.img_u8 = new jsfeat.matrix_t(w, h, jsfeat.U8_t | jsfeat.C1_t);
		this.ii_sum = new Int32Array((w+1)*(h+1));
		this.ii_sqsum = new Int32Array((w+1)*(h+1));
		this.ii_tilted = new Int32Array((w+1)*(h+1));

		this.corners = [];
		for(var i = 0; i < this.width * this.height; i++) {
			this.corners[i] = new jsfeat.point2d_t(0,0,0,0);
		}

		this.edges_density = 0.13;
		this.scale_factor = 1.1;
		this.min_scale = 2;
		this.use_tilted = false;

		this.confidence = 0.5;
		this.color = "black";
		this.block = { x:0, y:0, width:this.width, height:0 };
    },

	haar:function(classifier, image, roi){
		if(roi) {
			this.color = "blue";
		} else {
			roi = {x:0, y:0, width:this.width, height:this.height};
			this.color = "yellow";
		}
		this.work_ctx.drawImage(image, roi.x, roi.y, roi.width, roi.height, 0, 0, this.work_canvas.width, this.work_canvas.height);
		var imageData = this.work_ctx.getImageData( 0,0, this.work_canvas.width,this.work_canvas.height);

		jsfeat.imgproc.grayscale(imageData.data, this.img_u8.data);

		// jsfeat.imgproc.equalize_histogram(this.img_u8, this.img_u8); // equalize_histogram

		jsfeat.imgproc.compute_integral_image(this.img_u8, this.ii_sum, this.ii_sqsum, this.use_tilted && classifier.tilted ? this.ii_tilted : null);

		jsfeat.haar.edges_density = this.edges_density;
		var rects = jsfeat.haar.detect_multi_scale(this.ii_sum, this.ii_sqsum, this.ii_tilted, null, this.img_u8.cols, this.img_u8.rows, classifier, this.scale_factor, this.min_scale);
		rects = jsfeat.haar.group_rectangles(rects, 1);

		jsfeat.math.qsort(rects, 0, rects.length-1, function(a,b){return (b.confidence<a.confidence);})

		for(var i in rects) {
			var unscale = 
			rects[i].x = rects[i].x * roi.width/this.work_canvas.width + roi.x;
			rects[i].y = rects[i].y * roi.height/this.work_canvas.height + roi.y;
			rects[i].width  *= roi.width/this.work_canvas.width;
			rects[i].height *= roi.height/this.work_canvas.height;
		}

		return rects;
	},


	 draw_match: function (ctx, r, color) {
		 if(this.debug && r) {
			ctx.strokeStyle = color;
			ctx.strokeRect(r.x,r.y,r.width,r.height);
		 }
	 },


    tick:function(){
        this._interval = compatibility.requestAnimationFrame(function(){
            LipDetector.tick();
        });

        if (this.webcam.readyState === this.webcam.HAVE_ENOUGH_DATA || this.useImage) {
			this.webcamCanvasCtx.drawImage(this.webcam, 0, 0, this.width, this.height);

			var face = this.haar(jsfeat.haar.frontalface, this.webcam)[0];
			this.draw_match(this.webcamCanvasCtx, face, "red");

			var lower_face;
			var upper_face;
			var eye_mask = { x:0, y:0, width:this.width, height:this.height*.6 };
			if(face) {
				lower_face = {};
				lower_face.y      = face.y + face.height*0.5;
				lower_face.height = face.height * 0.6;
				lower_face.x      = face.x + face.width*0.1;
				lower_face.width  = face.width*0.8;

				upper_face = {};
				upper_face.y      = face.y;
				upper_face.height = face.height*0.4;
				upper_face.x      = face.x - face.width*0.1;
				upper_face.width  = face.width * 1.2;

				eye_mask = { x:face.x-face.width*0.25, y:face.y, width:face.width*1.5, height:face.y+face.height*0.6 };
				this.draw_match(this.webcamCanvasCtx, lower_face, "green");
			}
			this.draw_match(this.webcamCanvasCtx, eye_mask, "white");

			var mouth = this.haar(jsfeat.haar.mouth, this.webcam, lower_face)[0];
			if(face) {
				if(mouth) { // XXX primor
					mouth.y = Math.ceil(mouth.y-this.height * 0.05);
					mouth.height = Math.ceil(mouth.height+this.height * 0.075);
					mouth.x = Math.ceil(mouth.x-mouth.width*0.2);
					mouth.width = Math.ceil(mouth.width*1.40);
				} else {
					mouth =  {confidence:0.5};
					mouth.y = Math.ceil(lower_face.y + lower_face.height * 0.2);
					mouth.height = Math.ceil(lower_face.height * 0.75);
					mouth.x = Math.ceil(lower_face.x + lower_face.width * 0.2);
					mouth.width = Math.ceil(lower_face.width * 0.6);
				}
			}
			this.draw_match(this.webcamCanvasCtx, mouth, this.color);

			var union_count = 0;
			var union = { x0:this.width, y0:this.height, x1:-1, y1:-1 };
			var eyes = this.haar(jsfeat.haar.eye, this.webcam, eye_mask);
			if(eyes.length > 0) {
				for(var i in eyes) {
					this.draw_match(this.webcamCanvasCtx, eyes[i], "cyan");
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

			this.draw_match(this.webcamCanvasCtx, this.block, "black");

			if(mouth) {
				this.confidence = this.confidence * 0.9 + mouth.confidence * 0.1;
				var intersect = !(this.block.x > mouth.x+mouth.width || 
							   this.block.x+this.block.width < mouth.x || 
							   this.block.y > mouth.y+mouth.height ||
							   this.block.y+this.block.height < mouth.y);
				if(mouth.confidence+0.2 >= this.confidence && !intersect) {
					this.draw_match(this.webcamCanvasCtx, mouth, "magenta");


					// XXX god help us
					var smallImageData = this.webcamCanvasCtx.getImageData( mouth.x, mouth.y, mouth.width, mouth.height);
					var small_img_u8 = new jsfeat.matrix_t(mouth.width, mouth.height, jsfeat.U8_t | jsfeat.C1_t);

					//this.webcamCanvasCtx.putImageData( smallImageData, 0,0, 0,0,mouth.width, mouth.height);

					jsfeat.imgproc.grayscale(smallImageData.data, small_img_u8.data);

					jsfeat.imgproc.box_blur_gray(small_img_u8, small_img_u8, 4, 0); // XXX ??

					jsfeat.yape06.laplacian_threshold = 16;
					jsfeat.yape06.min_eigen_value_threshold = 8;

					var count = jsfeat.yape06.detect(small_img_u8, this.corners);

					this.webcamCanvasCtx.strokeStyle = "white";
					for(var i=0; i<count; i++ ) {
						this.webcamCanvasCtx.strokeRect(mouth.x+this.corners[i].x,mouth.y+this.corners[i].y, 1,1);
					}


				} else {
					console.log("failed: " + mouth.confidence +  " >= " + this.confidence + " && "+ (!intersect));
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

