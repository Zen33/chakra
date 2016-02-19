/**
 * pdf转为image为当前最优方案，原因如下：
 * 1）最初设想合并为一张canvas，但是浏览器针对大尺寸canvas有约束，如果pdf较多，则会出现无法正常渲染的状况。
 * 2）如果将每张pdf都分成单个canvas，操作效率低于image，且浏览器滚屏会卡顿。
 * 目前已知部分pdf文档在ie10/11浏览器下存在“CONSOLE6000: Warning: Unable to decode image: DataCloneError”（Warning: Dependent image isn't ready yet）问题，问题已提交pdf.js团队，暂未能得到解决方案。
 */
/*jslint browser: true, devel: true, white: true*/
/*global window PDFJS */
/*jslint this*/
(function(global, PDFJS) {
    'use strict';
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var pdf;
    var loader;
    var PdfViewer = function(opts) { // 构造viewer
        this.element = opts.element || document.body; // element(optional, 渲染容器，默认追加到body)
        this.pages = []; // 缓存
        this.pageRange = opts.pageRange || [1, 9999]; // rangeRange(optional, 文档页数范围，默认为当全全部pdf)
        this.currentPage = this.pageRange[0];
        this.url = opts.url || ''; // url(required, 文档，跨域需要远端开启可访问请求（未测）)
        this.scale = opts.scale || 1; // scale(optional, 放大比例，默认比例为1)
        this.width = opts.width; // width(optional, 宽，默认为等比例约束)
        this.height = opts.height; // height(optional, 高，默认为等比例约束)
        this.bookmark = opts.bookmark || 1; // bookmark(optional, 书签，也即需要定位的页数，默认定位首页)
    };

    PdfViewer.prototype.init = function() { // 执行初始化
        var self = this;
        var percent = document.querySelector('#pdfViewerLoader label');

        PDFJS.getDocument(self.url).then(function(pdf) { // 载入pdf (promise)
            var getPage;

            getPage = function() { // 得到指定页面
                pdf.getPage(self.currentPage).then(function(page) {
                    var viewport = page.getViewport(self.scale);
                    var renderContext = {};

                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    self.width = self.width || canvas.width;
                    self.height = self.height || canvas.height;
                    renderContext = {
                        canvasContext: ctx,
                        viewport: viewport
                    };
                    page.render(renderContext).then(function() { // canvas入缓存
                        self.pages.push(canvas.toDataURL('image/jpeg')); // 压缩图片（留空为png）
                        if (self.currentPage < self.pageRange[1]) {
                            self.currentPage += 1;
                            percent.innerHTML = parseInt(self.currentPage / self.pageRange[1] * 100) + '%';
                            getPage();
                        } else { // 所有指定页面载入完毕
                            percent.parentNode.style.display = 'none';
                            self.pages.forEach(function(ignore, index) { // named ignore just for jslint
                                self.addPage(index, self.showPage);
                            });
                        }
                    });
                });
            };

            if (self.pageRange[1] > pdf.numPages) {
                self.pageRange[1] = pdf.numPages;
            }
            if (self.currentPage && self.currentPage <= pdf.numPages) {
                getPage();
            }
        }, function(error) { // 异常处理
            // console.log(error);
            percent.innerHTML = error.message;
        });
    };
    PdfViewer.prototype.addPage = function(index, callback) { // 创建页面
        var img = new Image();
        var self = this;

        img.onload = function() {
            // ctx.drawImage(this, 0, 0, ctx.canvas.width, ctx.canvas.height);
            if (callback && typeof callback === 'function') {
                callback.apply(self, [this, index]);
            }
        };
        img.id = 'pdfViewerPage' + index;
        img.className = 'pdf-viewer-page';
        img.src = self.pages[index];
        img.style.display = 'none';
        self.element.appendChild(img);
    };
    PdfViewer.prototype.showPage = function(img, index) { // 显示文档
        img.style.width = this.width + 'px';
        img.style.height = this.height + 'px';
        img.style.display = 'block';
        if (this.bookmark === this.pageRange[0] + index) { // 定位(书签)
            setTimeout(function(self) {
                if (self.element === document.body) {
                    document.documentElement.scrollTop = img.offsetTop; // IE
                } else {
                    self.element.style.height = self.height + 'px';
                    self.element.style.overflowY = 'auto';
                }
                self.element.scrollTop = img.offsetTop;
            }, 0, this);
        }
    };
    PdfViewer.prototype.clear = function(opts) { // 重置
        var img = this.element.querySelectorAll('.pdf-viewer-page');
        var percent = document.querySelector('#pdfViewerLoader label');

        img.forEach(function(item) {
            item.parentNode.removeChild(item);
        });
        this.element = opts.element || this.element;
        this.pages = [];
        this.pageRange = opts.pageRange || this.pageRange;
        this.currentPage = this.pageRange[0];
        this.url = opts.url || this.url;
        this.scale = opts.scale || this.scale;
        this.width = opts.width || this.width;
        this.height = opts.height || this.height;
        this.bookmark = opts.bookmark || this.bookmark;
        percent.innerHTML = '0%';
        percent.parentNode.style.display = 'block';
        return this;
    };
    global.pdfViewer = {
        init: function(opts) { // 初始化，参数为对象
            if (!PDFJS) { // 需要依赖pdf.js
                return;
            }
            // PDFJS.disableWorker = true; // 跨域 due to CORS
            if (!pdf) {
                pdf = new PdfViewer(opts);
            }
            if (!document.querySelector('#pdfViewerLoader')) { // 创建进度提示
                loader = document.createElement('div');
                loader.id = 'pdfViewerLoader';
                loader.className = 'pdf-viewer-loader';
                loader.innerHTML = 'Loading...<label>0%</label>';
                document.body.appendChild(loader);
            }
            return pdf.init();
        },
        update: function(opts) { // 更新当前
            if (pdf) {
                pdf.clear(opts).init();
            }
        }
    };
    return global.pdfViewer;
}(window, PDFJS));