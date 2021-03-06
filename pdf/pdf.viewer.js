/**
 * pdf转为image为当前最优方案，原因如下：
 * 1）最初设想合并为一张canvas，但是浏览器针对大尺寸canvas有约束，如果pdf较多，则会出现无法正常渲染的状况。
 * 2）如果将每张pdf都分成单个canvas，操作效率低于image，且浏览器滚屏会卡顿。
 * 3）如果开启分页模式，则直接渲染canvas。
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
    var loader = '<div id="pdfViewerLoader" class="pdf-viewer-loader"><label>0%</label></div>';
    var PdfViewer = function(opts) { // 构造view
        this.element = opts.element || document.body; // element(optional, 渲染容器，默认追加到body)
        this.paging = opts.paging || null; // paging(optional, 默认不开启翻页模式)
        this.pageRange = Array.isArray(opts.pageRange) ? opts.pageRange.map(Number) : [1, 9999]; // rangeRange(optional, 文档页数范围，默认为当全全部pdf)
        this.currentPage = this.paging || this.pageRange[0];
        this.url = opts.url || ''; // url(required, 文档，跨域需要远端开启可访问请求（未测）)
        this.scale = opts.scale || 1; // scale(optional, 放大比例，默认比例为1)
        this.width = opts.width; // width(optional, 宽，默认为等比例约束)
        this.height = opts.height; // height(optional, 高，默认为等比例约束)
        this.bookmark = parseInt(opts.bookmark, 10) || 1; // bookmark(optional, 书签，也即需要定位的页数，默认定位首页)
        this.callback = opts.callback || null; // callback(optional, 默认无回调函数)
        this.pages = []; // 当前页面存储
        this.numPages = null; // 文档总页数
        this.cache = null; // 文档缓存
    };

    PdfViewer.prototype.available = true; // 当前是否可用
    PdfViewer.prototype.init = function() { // 执行初始化
        var percent = document.querySelector('#pdfViewerLoader label');

        percent.style.display = this.paging === null ? 'block' : 'none';
        return this.cache ? this.renderPage(percent) : this.loadPage(percent);
    };
    PdfViewer.prototype.loadPage = function(percent) { // 载入pdf (promise)
        var self = this;

        PDFJS.getDocument(self.url).then(function(pdf) {
            self.cache = pdf;
            self.numPages = pdf.numPages;
            if (self.pageRange[1] > self.numPages) {
                self.pageRange[1] = self.numPages;
            }
            if (self.currentPage && self.currentPage <= self.numPages) {
                self.renderPage(percent);
            }
        }, function(error) { // 异常处理
            // console.log(error);
            percent.innerHTML = error.message;
        });
    };
    PdfViewer.prototype.renderPage = function(percent) { // 页面渲染
        var self = this;

        percent = percent || document.querySelector('#pdfViewerLoader label');
        if (!self.available || !self.cache) {
            return;
        }
        self.available = false;
        self.cache.getPage(self.currentPage).then(function(page) { // 载入当前页
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
            page.render(renderContext).then(function() { // 渲染当前页
                self.available = true;
                if (self.paging === null) { // 非翻页模式
                    self.pages.push(canvas.toDataURL('image/jpeg')); // 压缩图片（留空为png）
                    if (self.currentPage < self.pageRange[1]) {
                        self.currentPage += 1;
                        percent.innerHTML = parseInt(self.currentPage / self.pageRange[1] * 100) + '%';
                        self.renderPage();
                    } else { // 所有指定页面载入完毕
                        percent.parentNode.style.display = 'none';
                        self.pages.forEach(function(ignore, index) { // named ignore just for jslint
                            self.addPage(index, self.showPage);
                        });
                        if (self.callback && typeof self.callback === 'function') {
                            self.callback();
                        }
                    }
                } else {
                    percent.parentNode.style.display = 'none';
                    self.element.appendChild(canvas);
                    if (self.callback && typeof self.callback === 'function') {
                        self.callback();
                    }
                }
            });
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
        var element = this.element;
        var img = Array.prototype.slice.call(element.querySelectorAll('.pdf-viewer-page'));
        var soloPage = element.querySelector('canvas');
        var percent = document.querySelector('#pdfViewerLoader label');

        img.forEach(function(item) {
            element.removeChild(item);
        });
        if (soloPage) {
            element.removeChild(soloPage);
        }
        if (this.url !== opts.url) {
            this.cache = null;
            this.numPages = null;
        }
        this.element = opts.element || this.element;
        this.paging = opts.paging || this.paging;
        this.pages = [];
        this.pageRange = Array.isArray(opts.pageRange) ? opts.pageRange.map(Number) : this.pageRange;
        this.currentPage = this.paging || this.pageRange[0];
        this.url = opts.url || this.url;
        this.scale = opts.scale || this.scale;
        this.width = opts.width || this.width;
        this.height = opts.height || this.height;
        this.bookmark = parseInt(opts.bookmark, 10) || this.bookmark;
        percent.innerHTML = '0%';
        percent.parentNode.style.display = 'block';
        return this;
    };
    global.pdfViewer = {
        init: function(opts) { // // 初始化，参数为对象
            if (PDFJS === 'undefined') { // 需要依赖pdf.js
                return;
            }
            // PDFJS.disableWorker = true; // 跨域 due to CORS
            if (!pdf) {
                pdf = new PdfViewer(opts);
            }
            if (!document.querySelector('#pdfViewerLoader')) { // 创建进度提示
                pdf.element.insertAdjacentHTML('beforebegin', loader); // afterend
            }
            return pdf.init();
        },
        update: function(opts) { // 更新当前
            if (pdf) {
                pdf.clear(opts).init();
            } else {
                this.init(opts);
            }
        },
        prevPage: function() { // 上页
            if (!pdf || (pdf && !pdf.paging) || (pdf && pdf.currentPage <= 1)) {
                return;
            }
            pdf.currentPage -= 1;
            pdf.renderPage();
        },
        nextPage: function() { // 下页
            if (!pdf || (pdf && !pdf.paging) || (pdf && pdf.currentPage >= pdf.numPages)) {
                return;
            }
            pdf.currentPage += 1;
            pdf.renderPage();
        },
        getPage: function() { // 得到当前页
            return pdf ? pdf.currentPage : null;
        },
        setPage: function(pageNum) { // 指定页
            if (!pdf || (pdf && !pdf.paging) || (pdf && pageNum > pdf.numPages) || (pdf && pageNum < 1)) {
                return;
            }
            pdf.currentPage = pageNum;
            pdf.renderPage();
        }
    };
    return global.pdfViewer;
}(window, PDFJS));