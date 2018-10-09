const ffmpeg=require('fluent-ffmpeg');
const fs = require('fs');
const Q = require('q');
const _ = require('underscore');
const isImage = require('is-image');

const config=require('./config.json');

//only for test. Use it to create a video with letters from name
function printNome() {
    let files = [];
    for(let i=0; i<config.name.length; i++) {
        files.push(config.dir.letters+name[i]+'.mp4');
    }
    return mergeFiles(files, config.name+'.mp4');
}

function _promisify(obj) {
    return new Promise((resolve, reject)=>{
        obj.on('error', (err)=> {
            reject(err);
        }).on('end', ()=>{
            resolve.apply(resolve,arguments);
        });
    });
}

function _fixName(name) {
    return name.toLowerCase().replace(/\s+/,'_');
}

const video={
    probe: (video)=>{
        return Q.ninvoke(ffmpeg,'ffprobe', video.dir+video.file).then((metadata)=>{
            return {
                video,
                duration: metadata.format.duration,
                width: metadata.streams[0].width,
                height: metadata.streams[0].height
            };
        });
    },
    image2Video: (image)=>{
        let outfile=_.extend({},image,{dir:config.dir.temp, file: _fixName(image.file+'.avi'), isImage:true});
        console.log('[image2Video]',JSON.stringify(outfile));
        if(fs.existsSync(outfile.dir+outfile.file)){
            return Q(outfile);
        }
        let cmd=ffmpeg(image.dir+image.file)
            .loop(config.film.imageseconds)
            .fps(config.film.fps)
            .videoCodec(config.film.codec)
            .size(config.film.size)
            //.aspect(config.film.aspect)
            .autopad()
            .save(outfile.dir+outfile.file);
        return _promisify(cmd).then(()=>outfile).catch(err=>{
            console.error("Error processing file",image.file);
            return Q.reject(err);
        });
    },
    normalizeVideo: (video)=>{
        let outfile=_.extend({},video,{dir:config.dir.temp, file: _fixName(video.file)});
        console.log('[normalizeVideo]',JSON.stringify(outfile));
        if(fs.existsSync(outfile.dir+outfile.file)){
            return Q(outfile);
        }
        let cmd=ffmpeg(video.dir+video.file)
        .noAudio()
        .fps(config.film.fps)
        .videoCodec(config.film.codec)
        .size(config.film.size)
        //.aspect(config.film.aspect)
        .autopad()
        .save(outfile.dir+outfile.file);
        return _promisify(cmd).then(()=>outfile);
    },
    mergeFiles: (files, outfile)=>{
        let cmd=ffmpeg();
        for(let i=0; i<files.length; i++) {
            cmd=cmd.input(files[i].dir+files[i].file);
        }
        cmd.mergeToFile(outfile.dir+outfile.file, config.dir.temp+'raw/');
        return _promisify(cmd);
    },
    renameFiles: (files)=>{
        for(let i=0; i<files.length; i++) {
            
        }
    }
};


//Normalize a list of files to get all of then on same size and video coded. Convert image2video if necessary
function processAllFiles(letterFiles, allvideos, creditFiles) {
    const p = (v)=>{
        if(isImage(v.file)) {
            return video.image2Video(v);
        }
        
        return video.normalizeVideo(v);
    };

    let pletters = Q.all(letterFiles.map(p));
    let pvideos  = Q.all(allvideos.map(p))
    let pcredits = Q.all(creditFiles.map(p))

    return Q.all([pletters, pvideos, pcredits]);
}

function probeAllVideos(allvideos) {
    return Q.all(allvideos.map(v=>video.probe(v))).then(res=>{
        let total=0;
        for(let i=0; i<res.length; i++) {
            console.log(JSON.stringify(res[i]));
            if(res[i].duration!=='N/A')
                total+=res[i].duration;
        }
        console.log('total',total);
        return res;
    });
}

const letterFiles = config.name.split('').map(f=>{
    return {'dir':config.dir.letters,'file':f+'.mp4', letter: f}
});
const allvideos = fs.readdirSync(config.dir.input).map(file=>{return {dir:config.dir.input,file}});
const creditFiles = config.credits.map(c=>{return {dir:config.dir.credits, file:c}});
processAllFiles(letterFiles, allvideos, creditFiles).spread((letterFiles, allvideos, creditFiles)=> {
    allvideos = _.shuffle(allvideos);
    let sequences = letterFiles.length - 1;
    let numPerSeq = Math.ceil(allvideos.length/sequences);
    let videos = _.chunk(allvideos, numPerSeq);
    //console.log(allvideos.length,sequences, numPerSeq, videos.length);

    let all=[letterFiles[0]];
    for(let i=0; i<sequences; i++) {
        let _videos=videos[i];
        //console.log(allvideos.length, all.length, _videos.length);
        all.push.apply(all, _videos);
        all.push(letterFiles[i+1]);
    }
    all.push.apply(all,creditFiles);

    return all;
    //return probeAllVideos(all).then(allvideos=>_.map(allvideos,v=>v.video));
}).then(videos=>{
    let outfile={dir:config.dir.output,file:_fixName(config.name+'.avi')};
    return video.mergeFiles(videos, outfile);
}).then(()=>{
    console.log('Finished');
}).catch(err=>{
    console.log('An error occurred: ',err);
});
