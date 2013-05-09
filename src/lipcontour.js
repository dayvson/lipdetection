var Vec2 = {
    right_normal: function(a) {
      return {x: -a.y, y: a.x};
    },
    sub: function(a, b) {
      return {x: b.x-a.x, y: b.y-a.y};
    },
    dot: function(a, b) {
      return a.x * b.x + a.y * b.y;
    },
    normalize: function(a) {
        var d = Math.sqrt(Vec2.dot(a,a));
      return {x: a.x/d, y: a.y/d};
    },
    distance:function(a, b){
        return Math.sqrt( Math.pow( a.x - b.x, 2) + Math.pow(a.y - b.y, 2) );
    },
    inside:function(shape,point) {
        var inside = true;
        for(var j=0; j < shape.length; j++ ) {
           var k = ( j + 1 ) % shape.length;
           var normal = Vec2.right_normal(Vec2.sub(shape[j], shape[k]));
           var vec = Vec2.sub(shape[j],point);
           var dir = Vec2.dot(normal, vec);
           if(dir < 0) { inside = false;  break; }
        }
        return inside;
   }
};

// ConvexHull: http://en.literateprograms.org/Quickhull_(Javascript)
var ConvexHull = {
    pointLineDistance:function(point, baseline){
        var vx, vy;
        vx = baseline[0].x - baseline[1].x;
        vy = baseline[1].y - baseline[0].y;
        return (vx * (point.y - baseline[0].y) + vy * (point.x - baseline[0].x))
    },
    findMostDistantPointFromBaseLine:function(baseLine, points) {
        var maxD = 0, maxPt, newPoints = [], currentPoint, dist;
        for (var idx in points) {
            currentPoint = points[idx];
            dist = this.pointLineDistance(currentPoint, baseLine);
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
        this.saveImage = false;
        this.motion = this.width/8;
        this.instability = 1;
        this.last_rank_shape = 9999;
        this.mouth = {x:this.width/2, y:this.height/2, width:0, height:0};
        this.convexhull = [];

        this.shape_base = [
            { x: -1,      y:  0     },
            { x: -0.75,   y: -0.66  },
            { x:  0,      y: -1     },
            { x:  0.75,   y: -0.66  },
            { x:  1,      y:  0     },
            { x:  0.75,   y:  0.66  },
            { x:  0,      y:  1     },
            { x: -0.75,   y:  0.66  }
        ];

        this.shape = [];
        for(var i=0; i<this.shape_base.length; i++) {
            this.shape[i] = {x:this.shape_base[i].x * this.scale_factor * this.areaLips.width() + this.areaLips.position().left, 
                y: this.shape_base[i].y * this.scale_factor * this.areaLips.height() + this.areaLips.position().top}
        }

        this.cube_size = 24;
        this.cube_div = 256/this.cube_size;
        this.chromakey_boost = [];
        this.chromakey_boost_count = 0;
        this.chromakey = [];
        for(var r=0; r< this.cube_size; r++) {
            this.chromakey[r] = [];
            for(var g=0; g< this.cube_size; g++) {
                this.chromakey[r][g] = [];
                for(var b=0; b< this.cube_size; b++) {
                    this.chromakey[r][g][b] = 0;
                }
            }
        }
        this.max_chromakey = 0;
        this.min_chromakey = 0;

        this.top_webcam = null;
        this.top_score = 0;
        this.top_contour = [];
        this.top_match = null;
        this.top_roi = null;
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

        this.top_countdown_max = 2;
    },
    init:function(webcam, webcamCanvas, lipCanvas, areaLips){
        this.debug = 1;
        this.areaLips = areaLips;
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
            average_distance += Vec2.distance(median, universe[i]);
            
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


        var motion = Vec2.distance(new_mouth, this.mouth);
        this.motion = this.motion * 0.9 + motion * 0.1;

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

        // ctx.strokeStyle = "cyan"
        // ctx.strokeRect(median.x-1, median.y-1, 3, 3);
        // this.drawRectangle(ctx,this.mouth,'red');
        // this.drawRectangle(ctx,mask,'cyan');


        // remove outliers (far from median)
        var max_distance = this.mouth.height;
        for(i=0; i< universe.length; i++) {
            if(!this.point_status[i]) continue;
            var dist = Math.sqrt( Math.pow( median.x - universe[i].x, 2) + Math.pow(Math.abs(median.y - universe[i].y), 2) );
            if(dist > max_distance) {
                this.point_status[i] = 0;
            }
        }


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

        // remove duplicates (too close)
        // TODO avoid removing from the edges
        var min_dist = 2;
        for(i=0; i< universe.length; i++) {
            if(!this.point_status[i]) continue;
            for(j=0; j< universe.length; j++) {
                if(i==j || !this.point_status[j]) continue;
                var dist = Vec2.distance(universe[i], universe[j])
                if(dist < min_dist) {
                    this.point_status[i] = 0;
                }
            }
        }


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
    highLine: function (img, pitch, x0, y0, x1, y1, tolerance){
        var dx = Math.abs(x1-x0);
        var dy = Math.abs(y1-y0);
        var sx = (x0 < x1) ? 1 : -1;
        var sy = (y0 < y1) ? 1 : -1;
        var err = dx-dy;

        var count = 0;
        var initial_tolerance = tolerance;
        while(true){
            if(x0<0 || y0<0 || x0 >= pitch || y0 >= img.length/4/pitch) break;
            var i = (y0*pitch + x0)*4;
            var r = Math.floor(img[i+0]/this.cube_div);
            var g = Math.floor(img[i+1]/this.cube_div);
            var b = Math.floor(img[i+2]/this.cube_div);

            //var chroma = (this.chromakey[r][g][b]-this.min_chromakey)/(this.max_chromakey-this.min_chromakey);
            //if(chroma < 0.333) break;

            var chroma = (this.chromakey[r][g][b])/(this.max_chromakey-this.min_chromakey);
            tolerance += Math.min(0,chroma);
            // console.log(count,tolerance);
            if(this.debug>5) {
                // img[i+0] = (value-this.min_chromakey) / (this.max_chromakey-this.min_chromakey) * 0xff;
                img[i+0] = 0xff
                img[i+1] = 0xff * tolerance / initial_tolerance;
                img[i+2] = 0xff * tolerance / initial_tolerance;
                img[i+3] = 0xff;
            }
            if(tolerance <= 0) break;
            count++;

            if ((x0==x1) && (y0==y1)) break;
            var e2 = 2*err;
            if (e2 >-dy){ err -= dy; x0  += sx; }
            if (e2 < dx){ err += dx; y0  += sy; }
        }
        return {x:x0, y:y0, score:tolerance, dist:count};
    },
    sumLine: function (img, pitch, x0, y0, x1, y1){
        var dx = Math.abs(x1-x0);
        var dy = Math.abs(y1-y0);
        var sx = (x0 < x1) ? 1 : -1;
        var sy = (y0 < y1) ? 1 : -1;
        var err = dx-dy;

        var value = 0;
        var count = 0;
        while(true){
            var i = (y0*pitch + x0)*4;
            var r = Math.floor(img[i+0]/this.cube_div);
            var g = Math.floor(img[i+1]/this.cube_div);
            var b = Math.floor(img[i+2]/this.cube_div);
            if(isNaN(r) || this.chromakey[r][g][b] < 0) break;
            value += this.chromakey[r][g][b];
            count++;


            if ((x0==x1) && (y0==y1)) break;
            var e2 = 2*err;
            if (e2 >-dy){ err -= dy; x0  += sx; }
            if (e2 < dx){ err += dx; y0  += sy; }
        }
        return value / count / this.max_chromakey;
    },
    testPuckerMatch: function() {

        // select points over the edges
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

        if(this.convexhull.length > 6) {

            var n = this.convexhull.length;
            var cx = this.mouth.x + this.mouth.width/2;
            var cy = this.mouth.y + this.mouth.height/2;

            var x0 = this.width-1;
            var y0 = this.height-1;
            var x1 = 0;
            var y1 = 0;

            var scale=0.65;
            var min_scale=0.15;

            for(i=0; i < n; i++ ) {
                var x = Math.round((this.convexhull[i][0].x - cx)*scale+cx),
                    y = Math.round((this.convexhull[i][0].y - cy)*scale+cy);

                if(x < x0) x0 = x-1;
                if(y < y0) y0 = y-1;
                if(x > x1) x1 = x+1;
                if(y > y1) y1 = y+1;
            }

            var step = 2;
            var border = 2*step;
            var roi = {
                x: Math.floor(x0-border),
                y: Math.floor(y0-border),
                width: Math.ceil((x1-x0)+border*2),
                height: Math.ceil((y1-y0)+border*2)
            };

            var smallImageData;
            if(roi.width == 0 || roi.height == 0) return 0;
            smallImageData = this.webcamCanvasCtx.getImageData( roi.x, roi.y, roi.width, roi.height );


            // sample pixels and accumulate on a color cube
            var small_img_4u8 = new Uint8Array(smallImageData.data.buffer);
            var size = smallImageData.width * smallImageData.height;
            var cx0 = smallImageData.width/2;
            var cy0 = smallImageData.height/2;
            i = 0;
            for(var y = 0; y < smallImageData.height ; y++) {
                for(var x = 0; x < smallImageData.width ; x++) {
                    var r = Math.floor(small_img_4u8[i++]/this.cube_div);
                    var g = Math.floor(small_img_4u8[i++]/this.cube_div);
                    var b = Math.floor(small_img_4u8[i++]/this.cube_div);
                    i++; // alpha
                    var dx = (x - cx0) / cx0;
                    var dy = (y - cy0) / cy0;
                    var d = Math.sqrt(Math.pow(dy,2)+Math.pow(dx,2));
                    var f = d > 0.888 ? -4 : d > 0.333 ? 0 : 128;
                    this.chromakey[r][g][b] += f / size;
                }
            }

            // damp colors
            var max_chroma = 0;
            var min_chroma = 999999999;
            var cube = [];
            for(var r=0; r< this.cube_size; r++) {
                cube[r] = [];
                for(var g=0; g< this.cube_size; g++) {
                    cube[r][g] = [];
                    for(var b=0; b< this.cube_size; b++) {
                        cube[r][g][b] = this.chromakey[r][g][b]*3;

                        if(this.chromakey_boost_count && this.chromakey_boost[r+":"+g+":"+b]) {
                            cube[r][g][b] += this.chromakey_boost[r+":"+g+":"+b] / this.chromakey_boost_count;
                        }

                        for(var dr=Math.max(0,r-1); dr<=Math.min(this.cube_size-1,r+1); dr++) {
                            for(var dg=Math.max(0,g-1); dg<=Math.min(this.cube_size-1,g+1); dg++) {
                                for(var db=Math.max(0,b-1); db<=Math.min(this.cube_size-1,b+1); db++) {
                                    cube[r][g][b] += this.chromakey[dr][dg][db];
                                }
                            }
                        }

                        var v = cube[r][g][b] = (cube[r][g][b] / 30.0 * 0.95) + (-0.000001 * 0.05);
                        if(v > max_chroma)  max_chroma = v;
                        if(v < min_chroma)  min_chroma = v;
                        
                    }
                }
            }
            this.chromakey = cube;
            this.max_chromakey = max_chroma;
            this.min_chromakey = min_chroma;
            this.chromakey_boost_count = 0;
            this.chromakey_boost = {};


            // find contour
            var contour = [];
            if(this.debug > 0) {
                this.lipCanvasCtx.globalAlpha = 1;
                this.lipCanvasCtx.strokeStyle = "cyan";
                this.lipCanvasCtx.beginPath();
            }
            for(i=0; i < this.shape_base.length; i++ ) {
                var x = Math.round(this.shape[i].x*0.5+(this.shape_base[i].x*roi.width*scale+cx)*0.5),
                    y = Math.round(this.shape[i].y*0.5+(this.shape_base[i].y*roi.height*scale+cy)*0.5);

                var x_in = Math.round(this.shape_base[i].x*roi.width*min_scale+cx),
                    y_in = Math.round(this.shape_base[i].y*roi.height*min_scale+cy);

                var p = this.highLine(small_img_4u8, smallImageData.width, x_in-roi.x, y_in-roi.y, x-roi.x, y-roi.y, .1);

                p.x += roi.x + Math.floor(Math.random()*7)-3;
                p.y += roi.y + Math.floor(Math.random()*3)-1;

                this.shape[i].x = this.shape[i].x *0.8 + 0.2* p.x;
                this.shape[i].y = this.shape[i].y *0.8 + 0.2* p.y;

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

            if(this.debug > 0) {
                this.lipCanvasCtx.globalAlpha = 1;
                this.lipCanvasCtx.strokeStyle = "red";
                this.lipCanvasCtx.beginPath();
                for(i=0; i < this.shape.length; i++ ) {
                    if(!i) this.lipCanvasCtx.moveTo(this.shape[i].x,this.shape[i].y);
                    else this.lipCanvasCtx.lineTo(this.shape[i].x,this.shape[i].y);
                }
                this.lipCanvasCtx.closePath();
                this.lipCanvasCtx.stroke();
            }


            // rank scale
            var rank_count = 0;
            var rank_shape = 0;
            for(i=0; i < this.shape.length; i++ ) {
                var j = (i - 1 + this.shape.length) % this.shape.length;
                var k = (i + 1) % this.shape.length;
                var a = Vec2.normalize(Vec2.sub(this.shape[i], this.shape[k]));
                var b = Vec2.normalize(Vec2.sub(this.shape[i], this.shape[j]));
                var ab = Vec2.dot(a, b);
                var c = Vec2.normalize(Vec2.sub(this.shape_base[i], this.shape_base[k]));
                var d = Vec2.normalize(Vec2.sub(this.shape_base[i], this.shape_base[j]));
                var cd = Vec2.dot(c, d);
                rank_shape += Math.abs(ab - cd);
            }
            rank_shape /= this.shape.length;

            // rank contour
            //var rank_count = 0; // above
            i = 0;
            var rank_chroma = 0;
            this.chromakey_boost_count = 0;
            for(var y = 0; y < smallImageData.height ; y++) {
                for(var x = 0; x < smallImageData.width ; x++) {
                    // TODO use destination-in operation on canvas to mask shape
                    var inside = Vec2.inside(this.shape, {x:roi.x+x,y:roi.y+y});
                    var r = Math.floor(small_img_4u8[i]/this.cube_div); i++;
                    var g = Math.floor(small_img_4u8[i]/this.cube_div); i++;
                    var b = Math.floor(small_img_4u8[i]/this.cube_div); i++;
                    i++;  // alpha
                    if(inside) {
                        rank_chroma += (this.chromakey[r][g][b]-this.min_chromakey) / (this.max_chromakey-this.min_chromakey);
                        rank_count++;
                        this.chromakey_boost_count ++;
                        this.chromakey_boost[r+":"+g+":"+b] = (this.chromakey_boost[r+":"+g+":"+b] || 0) + 4;
                    } else {
                        this.chromakey_boost_count ++;
                        this.chromakey_boost[r+":"+g+":"+b] = (this.chromakey_boost[r+":"+g+":"+b] || 0) - 128;
                    }
                }
            }
            rank_chroma /= rank_count;


            if(this.debug > 0) {
                this.lipCanvasCtx.globalAlpha = 1;
                this.lipCanvasCtx.putImageData(smallImageData, 0, this.height-smallImageData.height);

                this.lipCanvasCtx.putImageData(smallImageData, smallImageData.width, this.height-smallImageData.height);

                var last_x = contour[0].x, last_y = contour[0].y;

                this.lipCanvasCtx.globalAlpha = 1;
                this.lipCanvasCtx.strokeStyle = "red";
                this.lipCanvasCtx.beginPath();
                this.lipCanvasCtx.moveTo(
                    last_x-roi.x+smallImageData.width, 
                    last_y-roi.y+this.height-smallImageData.height
                    );

                for(i=1; i < contour.length; i++ ) {
                    var x = contour[i].x;
                    var y = contour[i].y;

                    this.lipCanvasCtx.lineTo(
                        x-roi.x+smallImageData.width, 
                        y-roi.y+this.height-smallImageData.height
                    );
                }

                this.lipCanvasCtx.closePath();
                this.lipCanvasCtx.stroke();
            }

            if(this.debug>0) {

                i = 0;
                var cx0 = smallImageData.width/2;
                var cy0 = smallImageData.height/2;
                for(var y = 0; y < smallImageData.height ; y++) {
                    for(var x = 0; x < smallImageData.width ; x++) {
                        var dx = (x - cx0) / cx0;
                        var dy = (y - cy0) / cy0;
                        var d = Math.sqrt(Math.pow(dy,2)+Math.pow(dx,2));
                        var f = d > 0.888 ? 0.333 : d > 0.333 ? 0.666 : 1;
                        i++;  // r
                        i++;  // g
                        i++;  // b
                        small_img_4u8[i] = f * 0xff; i++;  // alpha
                    }
                }
                this.lipCanvasCtx.putImageData(smallImageData, smallImageData.width*2, this.height-smallImageData.height);

                i = 0;
                for(var y = 0; y < smallImageData.height ; y++) {
                    for(var x = 0; x < smallImageData.width ; x++) {
                        var r = Math.floor(small_img_4u8[i+0]/this.cube_div);
                        var g = Math.floor(small_img_4u8[i+1]/this.cube_div);
                        var b = Math.floor(small_img_4u8[i+2]/this.cube_div);
                        var c = (this.chromakey[r][g][b]-this.min_chromakey) / (this.max_chromakey-this.min_chromakey);
                        i++;  // r
                        i++;  // g
                        i++;  // b
                        small_img_4u8[i] = (c*0.75+0.25) * 0xff; i++;  // alpha
                        //small_img_4u8[i] = c>0.333 ? 0xff : 0x00 ; i++;  // alpha
                    }
                }
                this.lipCanvasCtx.putImageData(smallImageData, smallImageData.width*3, this.height-smallImageData.height);

                i = 0;
                for(var y = 0; y < smallImageData.height ; y++) {
                    for(var x = 0; x < smallImageData.width ; x++) {
                        var inside = Vec2.inside(this.shape, {x:roi.x+x,y:roi.y+y});
                        i++;  // r
                        i++;  // g
                        i++;  // b
                        small_img_4u8[i] = inside ? 0xff : 0x40; i++;  // alpha
                    }
                }
                this.lipCanvasCtx.putImageData(smallImageData, smallImageData.width*4, this.height-smallImageData.height);
            }

            this.instability = this.instability * 0.9 + Math.abs(this.last_rank_shape-rank_shape) * 0.1;
            this.last_rank_shape = rank_shape;
            var score = rank_chroma / (1+rank_shape*1000000+this.instability*1000000) / (1+this.motion/100);

            if(score > this.top_score) {
                this.top_score = score;
                this.top_contour = [];
                for(i in this.shape) { this.top_contour[i] = {x:this.shape[i].x, y:this.shape[i].y}; }
                this.top_match = smallImageData;
                this.top_webcam = this.webcamCanvasCtx.getImageData( 0, 0, this.width, this.height);
                this.top_roi = roi;
                this.top_countdown = this.top_countdown_max;
            }

            //console.log(this.top_score, score, rank_chroma, rank_shape, this.instability, this.motion, this.top_countdown);
        }

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
            dist = Vec2.distance(corners[i], centerMouth);
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
    processFrame:function(){
        var face, lower_face, upper_face, eye_mask, work, mouth, eyes;
      
        lower_face = this.getLowerFaceArea(face);
        upper_face = this.getUpperFaceArea(face);
        eye_mask = this.getEyeArea(face);
        work = face ? this.small_work_area: this.large_work_area;
        mouth = {x:this.areaLips.position().left,
                y:this.areaLips.position().top, 
                width:this.areaLips.width(),
                height:this.areaLips.height(),
                confidence:1.5, neighbors:10};
        eyes = [];
   
        this.block = this.getEyesAndUpperFaceUnionArea(eyes, face, upper_face, this.block);

        this.matchMouthModel(mouth);
        this.trackMouthModel(mouth);
        this.drawOpticalFlow(this.lipCanvasCtx);

    },
    drawContour:function(){
        this.lipCanvasCtx.globalAlpha = 0.01;
        for(var j=0 ; j<40; j++) {
            this.lipCanvasCtx.fillStyle = "magenta";
            this.lipCanvasCtx.beginPath();

            for(i=0; i < this.top_contour.length; i++ ) {
                var x = this.top_contour[i].x + Math.floor(Math.random()*9)-4;
                var y = this.top_contour[i].y + Math.floor(Math.random()*5)-2;

                if(!i) this.lipCanvasCtx.moveTo(x,y);
                else this.lipCanvasCtx.lineTo(x,y);
            }

            this.lipCanvasCtx.closePath();
            this.lipCanvasCtx.fill();
        }
    },
    saveImage:false,
    framesSelected:[],
    indexFrame:0,
    tick:function(){
        var face, lower_face, upper_face, eye_mask, work, mouth, eyes;
        this._interval = compatibility.requestAnimationFrame(function(){
            LipDetector.tick();
        });
        this.lipCanvasCtx.clearRect(0, 0, this.width, this.height);
        if ((this.webcam.readyState === this.webcam.HAVE_ENOUGH_DATA || this.useImage)) {
            this.debugPos = 0;
            
            this.webcamCanvasCtx.globalAlpha = 0.75;
            this.webcamCanvasCtx.drawImage(this.webcam, 0, 0, this.width, this.height);
            this.webcamCanvasCtx.globalAlpha = 1;
        }
        
        if(this.saveImage){
            if(this.framesSelected.length < 180){
                this.framesSelected.push(this.webcamCanvasCtx.getImageData(0, 0, this.width, this.height));
            }else{
                this.webcamCanvasCtx.clearRect(0,0, this.width, this.height);
                this.webcamCanvasCtx.putImageData(this.framesSelected[this.indexFrame], 0, 0);
                console.log(this.indexFrame);
                if(this.testPuckerMatch()){
                    this.drawContour();
                    this.reset();
                    this.stop();
                    this.saveImage = false;
                    this.framesSelected = [];
                    this.indexFrame  = 0;
                    this.onBestLipDetected();
                }
                this.indexFrame = Math.min(this.framesSelected.length-1, this.indexFrame + 1);
            }
            
            
        }else{
            this.processFrame();    
        }
    },
    getContours:function(){
        return this.top_contour;
    },
    getLipsImageData:function(){
        return this.lipCanvasCtx.getImageData(0,0, this.lipCanvas.width,this.lipCanvas.height);
    }, 
    stop:function () {
        compatibility.cancelAnimationFrame(this._interval);
    }
}  

