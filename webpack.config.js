const path = require("path");

/* ---------------------------  自定义插件 ------------------------------ */
const { WebpackRunPlugin, WebpackDonePlugin } = require("./webpack");

/* ---------------------------  自定义loader ------------------------------ */
const { loader1, loader2 } = require("./webpack");

module.exports = {
    mode: "development", //防止代码被压缩
    entry: "./src/index.js", //入口文件
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].js",
    },
    devtool: "source-map", //防止干扰源文件
    plugins: [new WebpackRunPlugin(), new WebpackDonePlugin()],

    module: {
        rules: [
            {
                text: /\.js$/,
                use: [loader1, loader2]
            }
        ]
    },
};

/* 

    （1）搭建结构，读取配置参数
    （2）用配置参数对象初始化 Compiler 对象
    （3）挂载配置文件中的插件
    （4）执行 Compiler 对象的 run 方法开始执行编译
    （5）根据配置文件中的 entry 配置项找到所有的入口
    （6）从入口文件出发，调用配置的 loader 规则，对各模块进行编译
        （6.1）把入口文件的绝对路径添加到依赖数组（this.fileDependencies）中，记录此次编译依赖的模块
        （6.2）得到入口模块的的 module 对象 （里面放着该模块的路径、依赖模块、源代码等）
            （6.2.1）读取模块内容，获取源代码
            （6.2.2）创建模块对象
            （6.2.3）找到对应的 Loader 对源代码进行翻译和替换
        （6.3）将生成的入口文件 module 对象 push 进 this.modules 中
    （7）找出此模块所依赖的模块，再对依赖模块进行编译
        （7.1）先把源代码编译成 AST
        （7.2）在 AST 中查找 require 语句，找出依赖的模块名称和绝对路径
        （7.3）将依赖模块的绝对路径 push 到 this.fileDependencies 中
        （7.4）生成依赖模块的模块 id
        （7.5）修改语法结构，把依赖的模块改为依赖模块 id
        （7.6）将依赖模块的信息 push 到该模块的 dependencies 属性中
        （7.7）生成新代码，并把转译后的源代码放到 module._source 属性上
        （7.8）对依赖模块进行编译（对 module 对象中的 dependencies 进行递归执行 buildModule ）
        （7.9）对依赖模块编译完成后得到依赖模块的 module 对象，push 到 this.modules 中
        （7.10）等依赖模块全部编译完成后，返回入口模块的 module 对象
    （8）等所有模块都编译完成后，根据模块之间的依赖关系，组装代码块 chunk
    （9）把各个代码块 chunk 转换成一个一个文件加入到输出列表
    （10）确定好输出内容之后，根据配置的输出路径和文件名，将文件内容写入到文件系统

*/