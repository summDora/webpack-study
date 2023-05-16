const parser = require("@babel/parser");
let types = require("@babel/types"); // 用来生成或者判断节点的AST语法树的节点
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;


class Compiler {
    constructor(webpackOptions) {
        // 存储配置信息
        this.options = webpackOptions

        // 内部钩子
        this.hooks = {
            run: new SyncHook(),  // 会在编译刚开始的时候触发此run钩子
            done: new SyncHook(),  // 会在编译刚开始的时候触发此done钩子

            // 在正式开始编译前，我们需要先调用 Compiler 中的 run 钩子，表示开始启动编译了；
            // 在编译结束后，需要调用 done 钩子，表示编译完成
        }
    }

    //第四步：执行`Compiler`对象的`run`方法开始执行编译
    run(callback) {
        this.hooks.run.call(); //在编译前触发run钩子执行，表示开始启动编译了
        const onCompiled = () => {
            this.hooks.done.call() // 当编译成功后会触发done这个钩子执行
        }

        this.compile(onCompiled) // 开始编译，成功之后调用onCompiled
    }

    compile(callback) {
        //虽然webpack只有一个Compiler，但是每次编译都会产出一个新的Compilation，
        //这里主要是为了考虑到watch模式，它会在启动时先编译一次，然后监听文件变化，如果发生变化会重新开始编译
        //每次编译都会产出一个新的Compilation，代表每次的编译结果
        let compilation = new Compilation(this.options);
        compilation.build(callback); //执行compilation的build方法进行编译，编译成功之后执行回调
    }
}




// 第一步：搭建结构，读取配置参数，这里接受的是webpack.config.js中的参数
function webpack(webpackOptions) {

    // 第二步：用配置参数对象初始化 `Compiler` 对象
    const compiler = new Compiler(webpackOptions);

    // 第三步：挂载配置文件中的插件
    // Webpack Plugin 其实就是一个普通的函数，在该函数中需要我们定制一个 apply 方法
    // 插件定义时必须要有一个 apply 方法，加载插件其实执行 apply 方法
    const { plugins } = webpackOptions;
    for (let plugin of plugins) {
        plugin.apply(compiler)
    }

    return compiler;
}
//第四步：执行`Compiler`对象的`run`方法开始执行编译
class Compilation {
    constructor(webpackOptions) {
        this.options = webpackOptions;
        this.modules = [];  // 本次编译所有生成出来的模块
        this.chunks = [];  // 本次编译产出的所有代码块，入口模块和依赖的模块打包在一起为代码块
        this.assets = [];  // 本次编译产出的资源文件
        this.fileDependencies = []; //本次打包涉及到的文件，这里主要是为了实现watch模式下监听文件的变化，文件发生变化后会重新编译
    }
    build(callback) {
        //这里开始做编译工作

        //第五步：根据配置文件中的`entry`配置项找到所有的入口

        let entry = {};
        if (typeof this.options.entry === "string") {
            entry.main = this.options.entry; //单入口，将entry:"xx"变成{main:"xx"}，这里需要做兼容
        } else {
            entry = this.options.entry;  //  多入口
        }

        //第六步：从入口文件出发，调用配置的 `loader` 规则，对各模块进行编译 
        for (let entryName in entry) {
            //entryName="main" entryName就是entry的属性名，也将会成为代码块的名称
            let entryFilePath = path.posix.join(baseDir, entry[entryName]); //path.posix为了解决不同操作系统的路径分隔符,这里拿到的就是入口文件的绝对路径

            // 6.1 把入口文件的绝对路径添加到依赖数组（`this.fileDependencies`）中，记录此次编译依赖的模块
            this.fileDependencies.push(entryFilePath);

            // 6.2 得到入口模块的的 `module` 对象 （里面放着该模块的路径、依赖模块、源代码等）
            let entryModule = this.buildModule(entryName, entryFilePath);

            // 6.3 将生成的入口文件 `module` 对象 push 进 `this.modules` 中
            this.modules.push(entryModule);
            console.log( this.modules )

        }

        // 编译成功执行callback
        callback()
    }
    // 当编译模块的时候，name：这个模块是属于哪个代码块chunk的，modulePath：模块绝对路径
    buildModule(name, modulePath) {
        // 6.2.1 读取模块内容，获取源代码
        let sourceCode = fs.readFileSync(modulePath, "utf8");

        // buildModule最终会返回一个modules模块对象，每个模块都会有一个id,id是相对于根目录的相对路径

        let moduleId = "./" + path.posix.relative(baseDir, modulePath);

        // 模块id： 从根目录出发，找到与该模块的相对路径（./src/index.js）

        // 6.2.2 创建模块对象
        let module = {
            id: moduleId,
            name: [name], // names设计成数组是因为代表的是此模块属于哪个代码块，可能属于多个代码块
            dependencies: [], // 它依赖的模块
            _source: "", // 该模块的代码信息
        };

        //6.2.3 找到对应的 `Loader` 对源代码进行翻译和替换
        let loaders = [];
        let { rules = [] } = this.options.module;
        rules.forEach( rule => {
            let { test } = rule;
            // 如果模块的路径和正则匹配，就把此规则对应的loader添加到loader数组中

            if (modulePath.match(test)) {
                loaders.push(...rule.use);
            }
        });


        //自右向左对模块进行转译
        // reduceRight 作用同 reduce 相同 ，区别是 遍历方向正相反，从数组最后一项 向前遍历到第一项
        sourceCode = loaders.reduceRight((code, loader) => {
            return loader(code);
        }, sourceCode )


        //第七步：找出此模块所依赖的模块，再对依赖模块进行编译
        //7.1：先把源代码编译成 [AST]

        let ast = parser.parse(sourceCode, { sourceType: "module" });

        traverse(ast, {
            CallExpression: ( nodePath ) => {
                const { node } = nodePath;
                // 7.2：在 `AST` 中查找 `require` 语句，找出依赖的模块名称和绝对路径

                // 此段需要补充 AST 基础 语法分析
                if (node.callee.name === "require") {
                    let depModuleName = node.arguments[0].value; //获取依赖的模块
                    let dirname = path.posix.dirname(modulePath); //获取当前正在编译的模所在的目录
                    let depModulePath = path.posix.join(dirname, depModuleName); //获取依赖模块的绝对路径
                    let extensions = this.options.resolve?.extensions || [ ".js" ]; //获取配置中的extensions
                    depModulePath = tryExtensions(depModulePath, extensions); //尝试添加后缀，找到一个真实在硬盘上存在的文件
                }
            }
        })

        return module;
    }

}


// 路径中 斜杠 在 windows 和 linux 中方向不一样 
// 获取入口文件的绝对路径，考虑到操作系统的兼容性问题，需要将路径的 \ 都替换成 /
function toUnixPath(filePath) {
    return filePath.replace(/\\/g, "/");
}

//获取文件路径
function tryExtensions( modulePath, extensions ){
    if (fs.existsSync(modulePath)) {
        return modulePath;
    }

    for (let i = 0; i < extensions?.length; i++) {
        let filePath = modulePath + extensions[i];
    }
}








/* ---------------------------  自定义插件 ------------------------------ */
class WebpackRunPlugin {
    apply(compiler) {
        compiler.hooks.run.tap("WebpackRunPlugin", () => {
            console.log("开始编译");
        });
    }
}
class WebpackDonePlugin {
    apply(compiler) {
        compiler.hooks.done.tap("WebpackDonePlugin", () => {
            console.log("结束编译");
        });
    }
}
/* ---------------------------  自定义loader ------------------------------ */
const loader1 = (source) => {
    return source + "//给你的代码加点注释：loader1";
};

const loader2 = (source) => {
    return source + "//给你的代码加点注释：loader2";
};

// export { WebpackRunPlugin, WebpackDonePlugin }