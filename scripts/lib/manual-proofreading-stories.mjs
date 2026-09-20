// Synthetic story anchors and deliberate corruptions. NOT production spelling rules.
const e = (correct, wrong, reason) => ({ correct, wrong, reason })
export const manualStories = [
  { language: 'ja', title: '霧の峡谷と銀の盾', name: 'TEST NHẬT 20P — BẢN CỐ Ý SAI',
    premise: 'Fantasy rescue story. Ren is a Sword Saint, not a feint. His family heirloom is a silver shield. The royal capital is threatened by flooding, not a foreign invasion. Exactly three thousand private soldiers under a local lord assist evacuation, not mercenaries. Mira is a physician. A High Priest has no medical authority. They cross a canyon using freight carts, evacuate people and save the capital. A neighboring theocracy and a powerful nation send peaceful help. Four chronological chapters, hopeful resolved ending.',
    chapters: [
      { beat: 'Dawn in royal capital. Flood warning, identify heirloom and mission. Load supplies on carts. End leaving west gate.', edits: [
        e('人々は剣の達人レンを剣聖と呼んでいた。','人々は剣の達人レンを牽制と呼んでいた。','Danh hiệu Kiếm Thánh, không phải kiềm chế'),
        e('銀の盾は祖父から受け継いだ家宝だった。','銀の盾は祖父から受け継いだ過法だった。','Gia bảo được truyền lại'),
        e('荷車に食料と毛布を積み込んだ。','煮車に食料と毛布を積み込んだ。','Xe chở hàng'),
        e('王都の西門には避難民が集まっていた。','オトの西門には避難民が集まっていた。','Vương đô'),
        e('王都を守るため、レンは出発を決めた。','オートを守るため、レンは出発を決めた。','Cùng vương đô, không phải chế độ tự động'),
        e('領主は三千人の兵を救援に派遣した。','領主は三チ人の兵を救援に派遣した。','Quân số 3000'),
        e('神殿の最高司祭が避難所の鍵を渡した。','神殿の最高市祭りが避難所の鍵を渡した。','Chức vụ tôn giáo')],
        controls: ['レンは争いを避けるため、抜かずに構えた剣で相手を牽制した。'] },
      { beat: 'Reach narrow canyon, bridge damaged, private soldiers set ropes and carry shields. Same 3000 soldiers, no new army. End establishing safe passage.', edits: [
        e('名簿には三千人全員の名前が並んでいた。','名簿には3 チェ人全員の名前が並んでいた。','Cùng 3000 quân'),
        e('隊長は総勢三千人だと改めて確認した。','隊長は総勢山人だと改めて確認した。','Số lượng, không phải núi'),
        e('領主直属の私兵が先頭を進んだ。','領主直属の司兵が先頭を進んだ。','Tư binh'),
        e('後方の私兵は子供たちを守った。','後方の七兵は子供たちを守った。','Cùng tư binh'),
        e('最後の私兵が橋の縄を結び直した。','最後の紙兵が橋の縄を結び直した。','Cùng tư binh'),
        e('深い峡谷の底を濁流が走っていた。','深い教国の底を濁流が走っていた。','Địa hình hẻm núi'),
        e('狭い峡谷に人々の声が響いた。','狭い強国に人々の声が響いた。','Cùng hẻm núi'),
        e('大盾を並べて落石から荷車を守った。','重頭建てを並べて落石から荷車を守った。','Khiên lớn chặn đá'),
        e('重盾を持つ兵が最後尾に立った。','重頭建てを持つ兵が最後尾に立った。','Khiên nặng, sửa theo ngữ cảnh')],
        controls: ['隣の教国からも毛布が届いていた。','強国と呼ばれる北の国も救援を申し出た。','山の頂にはまだ雪が残っていた。'] },
      { beat: 'Mira treats injured guard, rescue trapped mill workers, distinguish repairs from treatment, coordinate danger without villain. End all trapped rescued.', edits: [
        e('ミラは負傷した兵士の傷を治した。','ミラは負傷した兵士の傷を直した。','Chữa thương, không sửa đồ'),
        e('隊長は部下に避難路を指示した。','隊長は部下に避難路を支持した。','Chỉ dẫn đường'),
        e('全員の安全を確認してから縄を外した。','全員の安全を確信してから縄を外した。','Kiểm tra an toàn'),
        e('レンは避難を勧めた。','レンは避難を薦めた。','Khuyên sơ tán')],
        controls: ['職人は壊れた車輪を直した。','ミラはレンの判断を支持した。'] },
      { beat: 'Return capital with survivors. Check numbers still 3000 total soldiers, restore family shield, gratitude without propaganda. Dawn after storm ending.', edits: [
        e('帰還した剣聖を子供たちが迎えた。','帰還した牽制を子供たちが迎えた。','Danh hiệu lặp ở cuối truyện'),
        e('レンは家宝を神殿の机に置いた。','レンは過法を神殿の机に置いた。','Gia bảo lặp'),
        e('最高司祭は一人ずつ名前を尋ねた。','最高市祭りは一人ずつ名前を尋ねた。','Chức vụ lặp'),
        e('レンは静かに橋を渡った。','レンは静かに箸を渡った。','Qua cầu, không phải đũa')],
        controls: ['食卓には木の箸が二膳置かれていた。','装置の切り替えレバーにはオートと刻まれていた。'] }
    ] },
  { language: 'th', title: 'คืนฝนพรำกับทางกลับบ้าน', name: 'TEST THÁI 20P — BẢN CỐ Ý SAI',
    premise: 'Contemporary family story in Bangkok. The woman เสี่ยวเสี่ยว and her husband ลู่ถิง are Chinese residents with these exact canonical Thai names. She is pregnant and attends a routine hospital appointment, while heavy rain disrupts roads. His car brand is Maybach written มายบัค. They live in a condominium penthouse. A caring driver and nurse help. No childbirth emergency or diagnosis invented. Narrative is medical fiction, not health advice. Four chronological chapters ending with their safe return and reconciliation about his busy work.',
    chapters: [
      { beat: 'Morning penthouse at condo. Mild nausea and scheduled prenatal check, no emergency. Couple disagreement about work; leave together.', edits: [
        e('เสี่ยวเสี่ยวยืนอยู่ริมหน้าต่าง','เสี่ยว ๆ ยืนอยู่ริมหน้าต่าง','Tên nữ chính viết liền'),
        e('เสี่ยวเสี่ยวหยิบสมุดนัดขึ้นมา','เสี่ยว เสี่ยวหยิบสมุดนัดขึ้นมา','Cùng tên riêng'),
        e('เธอตั้งครรภ์และมีนัดกับแพทย์ในวันนี้','เธอตั้งครันและมีนัดกับแพทย์ในวันนี้','Mang thai'),
        e('วันนี้เธอจะไปตรวจครรภ์ตามนัด','วันนี้เธอจะไปตรวจ คันตามนัด','Khám thai'),
        e('ห้องเพนต์เฮาส์ยังเงียบสงบ','ห้องเพนเฮส์ยังเงียบสงบ','Penthouse'),
        e('ด้านล่างของคอนโดมีรถรออยู่','ด้านล่างของคอนโด้มีรถรออยู่','Condo'),
        e('เธอรู้สึกพะอืดพะอมเล็กน้อย','เธอรู้สึกผะอืด ผะ ออมเล็กน้อย','Buồn nôn'),
        e('ลู่ถิงเก็บโทรศัพท์ใส่กระเป๋า','ลู่ ถ่วยเก็บโทรศัพท์ใส่กระเป๋า','Tên nam chính')], controls: ['ในตู้มีอุปกรณ์ครบครัน','รองเท้าคู่นี้คับเกินไปสำหรับเขา'] },
      { beat: 'Ride through rain in Maybach, detour and help elderly neighbor to hospital. Couple talks naturally. Arrive at hospital entrance.', edits: [
        e('รถมายบัคจอดอยู่หน้าประตู','รถไมาย์ บัจอดอยู่หน้าประตู','Thương hiệu xe'),
        e('คนขับพามายบัคเลี้ยวเข้าถนนอีกสาย','คนขับพาไม บั๊กเลี้ยวเข้าถนนอีกสาย','Cùng thương hiệu'),
        e('ลู่ถิงเปิดประตูให้ภรรยา','ลู่ ถวยเปิดประตูให้ภรรยา','Cùng tên nam chính'),
        e('เสี่ยวเสี่ยวขอบคุณคนขับ','เสียว เสียวขอบคุณคนขับ','Tên riêng bị đổi thanh'),
        e('เสี่ยวเสี่ยวมองสายฝนผ่านกระจก','เสียว เสี่ยวมองสายฝนผ่านกระจก','Tên riêng không nhất quán'),
        e('เธอเริ่มพะอืดพะอมอีกครั้ง','เธอเริ่มพระ อืด พอมอีกครั้ง','Buồn nôn, không phải พระ'),
        e('เขาขออนุญาตจอดรถที่ทางเข้า','เขาขออนุญาติจอดรถที่ทางเข้า','Từ xin phép')], controls: ['ถนนช่วงนี้คับแคบแต่ยังผ่านได้','เธอเสียวฟันเมื่อจิบน้ำเย็น'] },
      { beat: 'Hospital registration and routine prenatal consultation. Ultrasound discussion, no diagnosis or procedure details. Husband listens and learns to be present.', edits: [
        e('ป้ายหน้าห้องเขียนว่าสูตินรีเวช','ป้ายหน้าห้องเขียนว่าสูติน รีเวท','Tên khoa'),
        e('พยาบาลประจำแผนกสูตินรีเวชเรียกชื่อเธอ','พยาบาลประจำแผนกสูตินริเวชเรียกชื่อเธอ','Cùng chuyên khoa'),
        e('แพทย์อธิบายเรื่องอัลตราซาวนด์อย่างใจเย็น','แพทย์อธิบายเรื่องเอา ตรา ซาวอย่างใจเย็น','Siêu âm'),
        e('เธอมองภาพอัลตราซาวนด์ทารกบนจอ','เธอมองภาพเอา ตรา ซาวนทารกบนจอ','Siêu âm thai'),
        e('สมุดเล่มนี้ใช้บันทึกการตรวจครรภ์','สมุดเล่มนี้ใช้บันทึกการตรวจครัน','Khám thai'),
        e('นั่งรอตรงนี้ก่อนนะคะ','นั่งรอตรงนี้ก่อนนะค่ะ','Tiểu từ lịch sự'),
        e('เขาสังเกตว่าเธอผ่อนคลายลง','เขาสังเกตุว่าเธอผ่อนคลายลง','Lỗi chính tả mới')], controls: ['เธอถามว่าไปทางไหนคะ','พยาบาลตอบว่าทางนี้ค่ะ'] },
      { beat: 'Return after rain. Help neighbor with groceries, quiet meal, he takes tomorrow off. End hopeful family scene without revealing baby sex.', edits: [
        e('ลู่ถิงจอดรถมายบัคข้างคอนโด','ลู่ถิงจอดรถไม บั๊กข้างคอนโด้','Hai lỗi cùng câu, giữ tên'),
        e('เสี่ยวเสี่ยววางสมุดตรวจครรภ์บนโต๊ะ','เสี่ยว เสี่ยววางสมุดตรวจครันบนโต๊ะ','Tên riêng và thuật ngữ lặp'),
        e('เขารู้สึกมีความสุขที่ได้อยู่ตรงนี้','เขารู้สึกมีความสุกที่ได้อยู่ตรงนี้','Hạnh phúc, không phải chín'),
        e('เธอตรวจสอบตารางนัดอีกครั้ง','เธอตรวจสอบตารางนัดอีกครั่ง','Thanh điệu')], controls: ['ข้าวในหม้อสุกแล้ว','เขายังเก็บเครื่องมือไว้ครบครันเหมือนเดิม'] }
    ] }
]
