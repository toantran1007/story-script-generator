// Explicit release operation; credentials are read locally and never logged.
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
const token=fs.readFileSync('.gh_token','utf8').trim()
const headers={Authorization:`Bearer ${token}`,'User-Agent':'Kichban-release','Content-Type':'application/json'}
const api='https://api.github.com/repos/toantran1007/story-script-generator'
const version='1.12.9',tag='v'+version
const names=[`story-script-generator-${version}-setup.exe`,`Story Script Generator ${version}.exe`,`story-script-generator-${version}-setup.exe.blockmap`,'latest.yml']
const installer=fs.readFileSync(path.join('dist',names[0]))
const yaml=fs.readFileSync('dist/latest.yml','utf8')
if(!yaml.includes('version: '+version)||!yaml.includes(crypto.createHash('sha512').update(installer).digest('base64')))throw Error('Update checksum mismatch')
async function json(url,options={}){const r=await fetch(url,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('GitHub HTTP '+r.status);return r.json()}
const ref=await json(api+'/git/ref/tags/'+tag)
console.log('Verified tag',ref.object.sha.slice(0,7))
const existing=await fetch(api+'/releases/tags/'+tag,{headers})
if(existing.status!==404)throw Error('Release already exists or cannot verify absence; refusing overwrite')
const release=await json(api+'/releases',{method:'POST',body:JSON.stringify({tag_name:tag,name:tag+' — Cải thiện viết chương và độ ổn định API',draft:true,body:'- Viết chương, memory chi tiết và dẫn chứng bằng mã câu; sửa cục bộ một lượt.\n- Quy tắc nhất quán theo tình huống, không ép thể loại.\n- Hỗ trợ Cookpit Responses API; báo rõ phản hồi rỗng và stream không hoàn tất.\n- Giới hạn chờ API 5 phút, không tự lặp khi nguồn trả rỗng.\n- Trang chủ phân biệt đang chạy, tạm dừng và gặp lỗi.\n- Lưu phiên, tiếp tục bản nháp và tải truyện khi chờ hook.\n\nLưu ý: xoá dự án là xoá vĩnh viễn dữ liệu nội bộ. Bài kiểm thử API ngắn không bảo đảm truyện dài luôn không lỗi.'})})
for(const name of names){
 const bytes=fs.readFileSync(path.join('dist',name))
 const asset=await json(release.upload_url.split('{')[0]+'?name='+encodeURIComponent(name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes})
 if(asset.size!==bytes.length)throw Error('Uploaded size mismatch')
 console.log('Uploaded',name,asset.size)
}
const assets=await json(api+`/releases/${release.id}/assets`)
if(assets.length!==names.length)throw Error('Asset count mismatch')
const published=await json(api+`/releases/${release.id}`,{method:'PATCH',body:JSON.stringify({draft:false,make_latest:'true'})})
console.log('Published',published.html_url)
