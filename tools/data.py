# -*- coding: utf-8 -*-
"""iAM Smart (Baekhyeon Hwarang SAR) - website content. Tuples are (English, Korean, Traditional Chinese);
Simplified Chinese is derived at build time."""

GOV_BASE = "/BHG/"                       # GovBHG (root-relative: same host on GitHub Pages and on dev/serve.py)
IMMD_BASE = "/bhg_Immigration_Department/"

UI = {
    "site": ("iAM Smart", "iAM Smart", "智方便"),
    "office": ("Digital Policy Office", "디지털정책판공실", "數字政策辦公室"),
    "gov": ("The Government of the Baekhyeon Hwarang Special Administrative Region of the Republic of Korea", "대한민국 백현화랑 특별행정구 정부", "大韓民國柏峴화랑特別行政區政府"),
    "menu": ("Menu", "메뉴", "選單"), "close": ("Close", "닫기", "關閉"), "top": ("Back to top", "맨 위로", "返回頁首"),
    "residents": ("Residents", "주민", "市民"), "orgs": ("Public & Private Organisations", "공공·민간 기관", "公私營機構"),
    "home": ("Home", "홈", "主頁"),
    "openapp": ("Open “iAM Smart” app", "\"iAM Smart\" 앱 열기", "開啟「智方便」應用程式"),
    "rev": ("Last revision date: November 2026", "최종 수정일: 2026년 11월", "修訂日期：2026年11月"),
    "important": ("Important notices", "중요 공지", "重要告示"), "privacy": ("Privacy Policy", "개인정보 처리방침", "私隱政策"),
    "disclaimer": ("Disclaimer", "면책 고지", "免責聲明"), "copyright": ("Copyright Notice", "저작권 안내", "版權告示"),
    "sitemap": ("Sitemap", "사이트맵", "網站地圖"), "access": ("Accessibility", "접근성", "無障礙瀏覽"),
    "expand": ("Expand All", "모두 펼치기", "全部展開"), "collapse": ("Collapse All", "모두 접기", "全部收起"),
    "total": ("Total: {n} records", "총 {n}건", "共{n}項紀錄"),
}

NAV = [   # (slug or None, title, children[(slug, title)])
    ("", UI["home"], []),
    (None, ("About “iAM Smart”", "\"iAM Smart\" 소개", "關於「智方便」"), [
        ("about", ("What is “iAM Smart”?", "\"iAM Smart\"란?", "「智方便」是什麼？")),
        ("about-version", ("“iAM Smart” Account Versions", "\"iAM Smart\" 계정 버전", "「智方便」戶口版本")),
        ("app-info", ("“iAM Smart” Mobile App", "\"iAM Smart\" 모바일 앱", "「智方便」流動應用程式")),
        ("security", ("Security & Privacy Protection", "보안 및 개인정보 보호", "保安及私隱保障")),
    ]),
    (None, ("Services", "서비스", "服務"), [
        ("services", ("Service Catalogue", "서비스 목록", "服務目錄")),
    ]),
    (None, ("“iAM Smart” Registration", "\"iAM Smart\" 가입", "登記「智方便」"), [
        ("reg", ("Registration Methods", "가입 방법", "登記方式")),
        ("reg-locations", ("Registration Locations", "가입 장소", "登記地點")),
    ]),
    ("faq", ("Frequently Asked Questions", "자주 묻는 질문", "常見問題"), []),
    ("news", ("News", "소식", "最新消息"), []),
    ("contact", ("Contact Us", "연락처", "聯絡我們"), []),
]
TITLES = {s: tt for _, _, ch in NAV for s, tt in ch}
TITLES.update({s: tt for s, tt, ch in NAV if s})
TITLES["download"] = ("Download “iAM Smart” mobile app", "\"iAM Smart\" 모바일 앱 받기", "下載「智方便」流動應用程式")

# ----------------------------------------------------------------------------- home
SLIDES = [
    (("Apply for a Baekhyeon Hwarang SAR Passport online with “iAM Smart” – it is just that easy!", "\"iAM Smart\"로 백현화랑 특별행정구 여권을 온라인으로 신청하세요. 정말 간단합니다!", "用「智方便」網上申請柏峴화랑特別行政區護照，就是這麼簡單！"), "#f6a04d", "gov:residents/immigration/traveldoc/passport/apply"),
    (("“iAM Smart+” registration process simplified! Register with your phone in 12 steps.", "\"iAM Smart+\" 가입 절차가 간단해졌습니다! 휴대폰으로 12단계면 끝납니다.", "「智方便+」登記程序簡化了！用手機12個步驟即可完成登記。"), "#2a9d8f", "reg"),
    (("Visa applications support “e-ME” form filling. Fill in your particulars in one tap.", "비자 신청에서 \"e-ME\" 자동 작성을 지원합니다. 한 번에 인적사항을 채우세요.", "簽證申請支援「e-ME」填表功能，一按即可填寫個人資料。"), "#5b6fd6", "immd:services/visas"),
    (("Show your “Personal Code” instead of your identity card for visitor registration.", "방문 등록 때 신분증 대신 \"개인 코드\"를 보여 주세요.", "訪客登記時出示「個人編碼」，無須出示身份證。"), "#d65b8f", "app-info"),
]
TILES = [
    ("reg", ("How to Register / Upgrade?", "가입·업그레이드 방법", "如何登記／升級？"), "how"),
    ("reg-locations", ("Register / Upgrade locations", "가입·업그레이드 장소", "登記／升級地點"), "map"),
    ("download", ("Download “iAM Smart” mobile app", "\"iAM Smart\" 모바일 앱 받기", "下載「智方便」流動應用程式"), "dl"),
]
STATS = [
    (("“iAM Smart” Registration", "\"iAM Smart\" 가입자", "「智方便」登記人數"), "regs"),
    (("“iAM Smart” Usage", "\"iAM Smart\" 이용 건수", "「智方便」使用次數"), "uses"),
    (("Services of Government, Public, Private Organisations and Government e-Forms", "정부·공공·민간 기관 서비스 및 정부 전자 서식", "政府、公營、私營機構服務及政府電子表格"), "svcs"),
]

# ----------------------------------------------------------------------------- pages (blocks: p / h2 / h3 / ul / ol / steps / table / faq / cards / versions / services / locations / news / app)
P = {}
P["about"] = [
    ("p", ("“iAM Smart” is a one-stop personalised digital services platform which enables Baekhyeon Hwarang residents to log in and use online services of the Government and public and private organisations with a single digital identity, by using their personal mobile phones.", "\"iAM Smart\"는 백현화랑 주민이 개인 휴대폰으로 하나의 디지털 신분을 사용해 정부와 공공·민간 기관의 온라인 서비스에 로그인하고 이용할 수 있게 하는 원스톱 맞춤형 디지털 서비스 플랫폼입니다.", "「智方便」是一站式個人化數碼服務平台，讓柏峴화랑居民以個人流動電話，憑單一數碼身份登入及使用政府和公私營機構的網上服務。")),
    ("h2", ("Target users", "이용 대상", "對象")),
    ("p", ("All Baekhyeon Hwarang residents aged 11 or over are eligible. A Baekhyeon Hwarang identity card and identity card number are issued on registration. Residents aged 11 to 17 need the consent of a parent or guardian.", "만 11세 이상 모든 백현화랑 주민이 이용할 수 있습니다. 가입하면 백현화랑 신분증과 신분증 번호가 발급됩니다. 만 11~17세는 부모나 보호자의 동의가 필요합니다.", "所有年滿11歲的柏峴화랑居民均可使用。登記時會獲發柏峴화랑身份證及身份證號碼。11至17歲的居民須得到父母或監護人同意。")),
    ("h2", ("Functions", "기능", "功能")),
    ("cards", [
        (("Authentication", "인증", "認證"), ("Use biometric or 6-digit password authentication to log in online services with a single identity.", "생체 인증이나 6자리 비밀번호로 하나의 신분으로 온라인 서비스에 로그인합니다.", "以生物認證或六位數字密碼，憑單一身份登入網上服務。"), "#e8710a"),
        (("“e-ME” Form Filling", "\"e-ME\" 자동 작성", "「e-ME」填表"), ("Fill in online forms automatically with the personal particulars saved in your “e-ME” profile, with your authorisation.", "동의하면 \"e-ME\" 프로필에 저장된 인적사항으로 온라인 서식을 자동으로 채웁니다.", "經你授權，以「e-ME」個人資料自動填寫網上表格。"), "#7a9e0e"),
        (("Personal Assistant", "개인 비서", "個人助理"), ("Receive personalised notifications, keep digital documents, and check your to-do list and application status.", "맞춤 알림을 받고, 전자 증명서를 보관하며, 할 일과 신청 현황을 확인합니다.", "接收個人化通知、保存數碼文件，以及查看待辦事項和申請進度。"), "#12a0c4"),
        (("Digital Signing", "전자서명", "數碼簽署"), ("Sign documents online with legal status under the Electronic Transactions Ordinance (“iAM Smart+” only).", "전자거래조례에 따른 법적 효력이 있는 전자서명을 합니다(\"iAM Smart+\"만).", "根據《電子交易條例》在網上簽署具法律效力的文件（只限「智方便+」）。"), "#b98d10"),
    ]),
    ("h2", ("Data held in “iAM Smart”", "\"iAM Smart\"에 저장되는 정보", "「智方便」持有的資料")),
    ("table", [("Category", "구분", "類別"), ("Data", "항목", "資料")], [
        [("Account Information", "계정 정보", "戶口資料"), ("Chinese / Korean name, English name, gender, identity card number, date of birth, hash of the personal code", "한글·한자 성명, 영문 성명, 성별, 신분증 번호, 생년월일, 개인 코드 해시값", "中文／韓文姓名、英文姓名、性別、身份證號碼、出生日期、個人編碼雜湊值")],
        [("“e-ME” Profile", "\"e-ME\" 프로필", "「e-ME」個人資料"), ("Primary email, other email, mobile phone number, home phone, office phone, prefix, education level, marital status, postal address, residential address, billing address", "기본 이메일, 기타 이메일, 휴대전화, 집 전화, 사무실 전화, 호칭, 학력, 혼인 여부, 우편 주소, 거주지 주소, 청구지 주소", "主要電郵、其他電郵、流動電話號碼、住宅電話、辦公室電話、稱謂、教育程度、婚姻狀況、通訊地址、住宅地址、賬單地址")],
    ]),
]
P["about-version"] = [
    ("p", ("“iAM Smart” account is available in two versions, namely “iAM Smart” and “iAM Smart+”.", "\"iAM Smart\" 계정은 \"iAM Smart\"와 \"iAM Smart+\" 두 가지 버전이 있습니다.", "「智方便」戶口分為「智方便」和「智方便+」兩個版本。")),
    ("p", ("Residents may register for “iAM Smart” or “iAM Smart+” per their needs. The difference between the two versions is that “iAM Smart+” will additionally provide digital signing and step-up authentication functions.", "필요에 따라 \"iAM Smart\" 또는 \"iAM Smart+\"에 가입할 수 있습니다. 두 버전의 차이는 \"iAM Smart+\"가 전자서명과 추가 본인 인증 기능을 더 제공한다는 점입니다.", "市民可按需要登記「智方便」或「智方便+」。兩個版本的分別在於「智方便+」額外提供數碼簽署及進階認證功能。")),
    ("versions", None),
    ("h2", ("How to upgrade to “iAM Smart+”", "\"iAM Smart+\"로 업그레이드하는 방법", "如何升級至「智方便+」")),
    ("p", ("Users of “iAM Smart” can upgrade to “iAM Smart+” in the mobile app by scanning the identity card and completing facial identification, or at a self-registration kiosk or registration service counter.", "\"iAM Smart\" 이용자는 앱에서 신분증을 스캔하고 얼굴 인증을 마치거나, 셀프 등록 키오스크나 등록 창구에서 \"iAM Smart+\"로 업그레이드할 수 있습니다.", "「智方便」用戶可在流動應用程式內掃描身份證並完成面部識別，或到自助登記站或登記服務櫃位，升級至「智方便+」。")),
]
P["app-info"] = [
    ("p", ("The “iAM Smart” mobile app is your personal portal to digital government services.", "\"iAM Smart\" 모바일 앱은 디지털 정부 서비스로 들어가는 나만의 관문입니다.", "「智方便」流動應用程式是你使用數碼政府服務的個人入口。")),
    ("app", None),
    ("h2", ("Login", "로그인", "登入")),
    ("p", ("You can log in with biometric authentication (fingerprint or face) by default. You can also log in with your 6-digit password after verifying your email address.", "기본적으로 생체 인증(지문·얼굴)으로 로그인합니다. 이메일 주소를 인증하면 6자리 비밀번호로도 로그인할 수 있습니다.", "你預設以生物認證（指紋或面容）登入。驗證電郵地址後，亦可用六位數字密碼登入。")),
    ("h2", ("Personal Code", "개인 코드", "個人編碼")),
    ("p", ("The Personal Code is a QR code which allows you to identify yourself to third parties without presenting your identity card. It contains your partial English name, age group, a one-way hash value and the generation time.", "개인 코드는 신분증을 보여 주지 않고 본인임을 확인시킬 수 있는 QR 코드입니다. 일부를 가린 영문 성명, 연령대, 일방향 해시값, 생성 시각이 들어 있습니다.", "個人編碼是一個二維碼，讓你無須出示身份證亦可向第三方證明身份，內含部分英文姓名、年齡組別、單向雜湊值及產生時間。")),
    ("h2", ("Settings", "설정", "設定")),
    ("ul", [("Account information and contact email address", "계정 정보 및 연락 이메일", "戶口資料及聯絡電郵地址"), ("Log records of the past 90 days", "최근 90일 로그 기록", "過去90日的使用紀錄"), ("Reset password", "비밀번호 재설정", "重設密碼"),
            ("Transfer account to another mobile phone", "다른 휴대폰으로 계정 이전", "轉移戶口至另一部流動電話"), ("Automatic logout after a period of inactivity", "일정 시간 미사용 시 자동 로그아웃", "閒置一段時間後自動登出"), ("De-register", "탈퇴", "取消登記")]),
]
P["security"] = [
    ("p", ("Personal information provided for registration and other information voluntarily provided is encrypted and stored in government data centre facilities.", "가입 시 제공한 개인정보와 자발적으로 제공한 정보는 암호화되어 정부 데이터센터 시설에 저장됩니다.", "登記時提供的個人資料及其他自願提供的資料會經加密，並儲存於政府數據中心設施。")),
    ("ul", [("Your “iAM Smart” account is bound to one personal mobile phone.", "\"iAM Smart\" 계정은 개인 휴대폰 한 대에 연결됩니다.", "你的「智方便」戶口與一部個人流動電話綁定。"),
            ("Every use of the 6-digit password triggers a notification email.", "6자리 비밀번호를 쓸 때마다 알림 이메일이 발송됩니다.", "每次使用六位數字密碼均會發出電郵通知。"),
            ("If an incorrect password is entered ten times in a row, the account becomes invalid and you must register again.", "비밀번호를 10회 연속 틀리면 계정이 무효가 되어 다시 가입해야 합니다.", "如連續十次輸入錯誤密碼，戶口會失效，須重新登記。"),
            ("Data is shared with an online service only after you give consent in the app.", "앱에서 동의한 뒤에만 온라인 서비스에 정보가 제공됩니다.", "只有在你於應用程式內同意後，資料才會提供予網上服務。"),
            ("For security reasons, scan “iAM Smart” QR codes from government websites or the app only.", "보안을 위해 \"iAM Smart\" QR 코드는 정부 웹사이트나 앱에서 나온 것만 스캔하세요.", "為安全起見，請只掃描政府網站或應用程式顯示的「智方便」二維碼。")]),
]
P["services"] = [
    ("p", ("The following online services support login and “e-ME” form filling with “iAM Smart”.", "다음 온라인 서비스는 \"iAM Smart\" 로그인과 \"e-ME\" 자동 작성을 지원합니다.", "以下網上服務支援以「智方便」登入及「e-ME」填表。")),
    ("services", None),
]
P["reg"] = [
    ("p", ("In the Baekhyeon Hwarang SAR, a Baekhyeon Hwarang identity card and identity card number are issued to you when you register for “iAM Smart”. You do not need to have an identity card before registering.", "백현화랑 특별행정구에서는 \"iAM Smart\"에 가입하면 백현화랑 신분증과 신분증 번호가 발급됩니다. 가입 전에 신분증이 있을 필요가 없습니다.", "在柏峴화랑特別行政區，登記「智方便」時便會獲發柏峴화랑身份證及身份證號碼。登記前無須持有身份證。")),
    ("h2", ("Mobile App – Aged 18 or over", "모바일 앱 – 만 18세 이상", "流動應用程式 – 18歲或以上")),
    ("p", ("Please prepare: a personal mobile phone with the “iAM Smart” app and an email address.", "준비물: \"iAM Smart\" 앱이 설치된 개인 휴대폰, 이메일 주소.", "請準備：已安裝「智方便」應用程式的個人流動電話及電郵地址。")),
    ("steps", [("Open the “iAM Smart” mobile app and select “Register now”", "\"iAM Smart\" 앱을 열고 \"지금 가입\" 선택", "開啟「智方便」流動應用程式並選擇「立即登記」"), ("Select “Adult (Aged 18 or over)”", "\"성인(만 18세 이상)\" 선택", "選擇「成人（18歲或以上）」"),
               ("Read and agree the “Declaration of the Applicant”", "\"신청인 선언\"을 읽고 동의", "閱讀並同意「申請人聲明」"), ("Choose voice navigation", "음성 안내 선택", "選擇語音導航"),
               ("Enter your personal particulars (name, sex, date of birth, place of birth, nationality, residence status)", "인적사항 입력(성명, 성별, 생년월일, 출생지, 국적, 거주 자격)", "輸入個人資料（姓名、性別、出生日期、出生地點、國籍、居留身份）"),
               ("Take the photograph for your identity card, with liveness checks", "실물 확인과 함께 신분증 사진 촬영", "拍攝身份證照片並進行活體檢測"), ("Set up the phone’s biometric authentication", "휴대폰 생체 인증 설정", "設定手機生物認證"),
               ("Set up a 6-digit “iAM Smart” password", "6자리 \"iAM Smart\" 비밀번호 설정", "設定六位數字「智方便」密碼"), ("Provide an email address", "이메일 주소 입력", "提供電郵地址"),
               ("Registration is completed – your identity card and identity card number are issued", "가입 완료 – 신분증과 신분증 번호 발급", "完成登記 – 獲發身份證及身份證號碼")]),
    ("h2", ("Mobile App – Aged 11 to 17", "모바일 앱 – 만 11~17세", "流動應用程式 – 11至17歲")),
    ("p", ("The applicant should be accompanied by a parent or guardian who is an “iAM Smart” user. The parent or guardian confirms the consent with his/her identity card number and “iAM Smart” password. The remaining steps are the same as for adults.", "신청인은 \"iAM Smart\" 이용자인 부모나 보호자와 함께해야 합니다. 부모나 보호자가 본인의 신분증 번호와 \"iAM Smart\" 비밀번호로 동의를 확인합니다. 나머지 단계는 성인과 같습니다.", "申請人須由屬「智方便」用戶的父母或監護人陪同。父母或監護人須以其身份證號碼及「智方便」密碼確認同意，其餘步驟與成人相同。")),
    ("h2", ("Upgrade to “iAM Smart+” in the app", "앱에서 \"iAM Smart+\"로 업그레이드", "在應用程式內升級至「智方便+」")),
    ("steps", [("Select “Upgrade to iAM Smart+”", "\"iAM Smart+로 업그레이드\" 선택", "選擇「升級至智方便+」"), ("Agree the declaration", "선언에 동의", "同意聲明"), ("Facial identification", "얼굴 인증", "面部識別"), ("“iAM Smart+” upgrade is completed", "\"iAM Smart+\" 업그레이드 완료", "完成升級至「智方便+」")]),
    ("h2", ("Self-registration kiosk / Registration service counter", "셀프 등록 키오스크·등록 창구", "自助登記站／登記服務櫃位")),
    ("steps", [("Select the language, then “Registration of iAM Smart” and your age group", "언어를 고르고 \"iAM Smart 계정이 없으신가요?\"와 나이 선택", "選擇語言，揀選「未有智方便戶口」及年齡組別"),
               ("Open the “iAM Smart” app, select “Registration from Self-registration kiosk / Registration service counters” and scan the kiosk QR code", "\"iAM Smart\" 앱에서 \"셀프 등록 키오스크·등록 창구에서 가입\"을 고르고 키오스크 QR 코드 스캔", "打開「智方便」應用程式，揀選「經自助登記站／登記服務櫃位登記」並掃描登記站二維碼"),
               ("Aged 11 to 17: the parent or guardian scans the QR code with his/her own app and agrees the declaration", "만 11~17세: 부모나 보호자가 본인 앱으로 QR 코드를 스캔하고 선언에 동의", "11至17歲：父母或監護人以其應用程式掃描二維碼並同意聲明"),
               ("Read and agree the applicant’s declaration and terms of use", "신청인 선언과 이용 약관을 읽고 동의", "細閱並同意申請人聲明及使用條款"),
               ("Enter your personal particulars and take your photograph at the kiosk", "키오스크에서 인적사항 입력 및 사진 촬영", "在登記站輸入個人資料及拍照"), ("Set up the 6-digit password and email address on the phone", "휴대폰에서 6자리 비밀번호와 이메일 설정", "在手機設定六位數字密碼及電郵地址"),
               ("“iAM Smart+” registration is completed – your identity card is issued at the kiosk", "\"iAM Smart+\" 가입 완료 – 키오스크에서 신분증 발급", "完成登記「智方便+」 – 在登記站發出身份證")]),
    ("p", ("The kiosk also provides upgrade to “iAM Smart+” and account suspension.", "키오스크에서는 \"iAM Smart+\" 업그레이드와 계정 정지도 할 수 있습니다.", "自助登記站亦提供升級至「智方便+」及暫停戶口服務。")),
    ("kiosk", ("Open the self-registration kiosk", "셀프 등록 키오스크 열기", "開啟自助登記站")),
]
P["reg-locations"] = [
    ("p", ("Self-registration kiosks and registration service counters are located at the following places.", "셀프 등록 키오스크와 등록 창구는 다음 장소에 있습니다.", "自助登記站及登記服務櫃位設於以下地點。")),
    ("table", [("Location", "장소", "地點"), ("Address", "주소", "地址"), ("Service", "서비스", "服務"), ("Opening hours", "운영 시간", "開放時間")], [
        [("Immigration Headquarters", "출입경사무처 본부", "入境事務處總部"), ("Baekhyeon Maeul Complex 3", "백현마을 3단지", "柏峴마을3社區"), ("Kiosk / Counter", "키오스크·창구", "登記站／櫃位"), ("Mon–Fri 8:45–17:00; Sat 9:00–12:00", "월~금 8:45~17:00, 토 9:00~12:00", "星期一至五 8:45–17:00；星期六 9:00–12:00")],
        [("Baekhyeon Maeul Complex 3 Branch Office", "백현마을 3단지 지소", "柏峴마을3社區分區辦事處"), ("Baekhyeon Maeul Complex 3", "백현마을 3단지", "柏峴마을3社區"), ("Kiosk", "키오스크", "登記站"), ("Daily 7:00–23:00", "매일 7:00~23:00", "每日 7:00–23:00")],
        [("Baekhyeon Maeul Complex 4 Branch Office", "백현마을 4단지 지소", "柏峴마을4社區分區辦事處"), ("Baekhyeon Maeul Complex 4", "백현마을 4단지", "柏峴마을4社區"), ("Kiosk / Counter", "키오스크·창구", "登記站／櫃位"), ("Mon–Fri 9:00–18:00", "월~금 9:00~18:00", "星期一至五 9:00–18:00")],
    ]),
    ("kiosk", ("Open the self-registration kiosk", "셀프 등록 키오스크 열기", "開啟自助登記站")),
]
FAQ = [
    (("General", "일반", "一般"), [
        (("Who can register for “iAM Smart”?", "누가 \"iAM Smart\"에 가입할 수 있나요?", "誰可登記「智方便」？"), ("Baekhyeon Hwarang residents aged 11 or above. You do not need an identity card beforehand – a Baekhyeon Hwarang identity card and identity card number are issued when you register. Residents aged 11 to 17 need the consent of a parent or guardian who is an “iAM Smart” user.", "만 11세 이상 백현화랑 주민입니다. 미리 신분증이 있을 필요가 없으며, 가입하면 백현화랑 신분증과 신분증 번호가 발급됩니다. 만 11~17세는 \"iAM Smart\" 이용자인 부모나 보호자의 동의가 필요합니다.", "年滿11歲的柏峴화랑居民。登記前無須持有身份證，登記時便會獲發柏峴화랑身份證及身份證號碼。11至17歲的居民須得到屬「智方便」用戶的父母或監護人同意。")),
        (("Can I authorise another person to register on my behalf?", "다른 사람이 대신 가입할 수 있나요?", "我可否授權他人代為登記？"), ("No. Registration must be completed by the applicant himself/herself, because the photograph taken during registration is printed on the identity card.", "아니요. 가입 중 촬영한 사진이 신분증에 인쇄되므로 본인이 직접 가입해야 합니다.", "不可以。由於登記時拍攝的照片會印在身份證上，登記必須由申請人親自完成。")),
        (("Where can I find my identity card?", "신분증은 어디에서 볼 수 있나요?", "我在哪裏可以找到我的身份證？"), ("Your identity card is kept in “Me” > “Digital Document” in the app. You can view it and download it as a PDF.", "앱의 \"내 정보\" > \"전자 증명서\"에 신분증이 보관됩니다. 보거나 PDF로 내려받을 수 있습니다.", "你的身份證存放於應用程式的「我的」>「數碼文件」，可查看或下載為PDF。")),
        (("After using “iAM Smart”, can I still use the original login method of online services?", "\"iAM Smart\"를 쓴 뒤에도 각 서비스의 원래 로그인 방법을 쓸 수 있나요?", "使用「智方便」後，我仍可用原有方法登入網上服務嗎？"), ("Yes, you can still use the original login method of those online services.", "예, 해당 온라인 서비스의 원래 로그인 방법도 계속 쓸 수 있습니다.", "可以，你仍可使用該等網上服務原有的登入方法。")),
    ]),
    (("Login and password", "로그인과 비밀번호", "登入及密碼"), [
        (("What is the purpose of the 6-digit password? How can I reset it?", "6자리 비밀번호는 무엇에 쓰나요? 어떻게 재설정하나요?", "六位數字密碼有何用途？如何重設？"), ("The password is used when the phone’s biometric authentication is not available or fails. You can reset it with the “Reset Password” function in the app. You will receive a notification whenever the password is used to log in.", "휴대폰 생체 인증을 쓸 수 없거나 실패할 때 사용합니다. 앱의 \"비밀번호 재설정\" 기능으로 재설정할 수 있습니다. 비밀번호로 로그인할 때마다 알림을 받습니다.", "當手機的生物認證功能不能使用或認證失敗時，便須使用密碼。你可使用應用程式內的「重設密碼」功能重設密碼。每次以密碼登入時，你均會收到通知。")),
        (("How often should I change my password?", "비밀번호는 얼마나 자주 바꿔야 하나요?", "我應多久更改密碼一次？"), ("You are not required to change it regularly, but we recommend changing it at a regular interval, for example every 90 days.", "정기적으로 바꿀 의무는 없지만 90일마다 등 주기적으로 바꾸기를 권장합니다.", "你無須定期更改密碼，但我們建議你定期（例如每90日）更改。")),
        (("What happens if I enter a wrong password many times?", "비밀번호를 여러 번 틀리면 어떻게 되나요?", "如多次輸入錯誤密碼會怎樣？"), ("If an incorrect password is entered ten times in a row, the account becomes invalid and you will be required to register again.", "10회 연속 틀리면 계정이 무효가 되어 다시 가입해야 합니다.", "如連續十次輸入錯誤密碼，戶口會失效，你須重新登記。")),
    ]),
    (("Lost mobile phone and switch account to new mobile phone", "휴대폰 분실 및 새 휴대폰으로 계정 이전", "遺失流動電話及轉移戶口至新流動電話"), [
        (("If I lose my mobile phone, how do I suspend and reactivate my account?", "휴대폰을 잃어버리면 계정을 어떻게 정지하고 다시 활성화하나요?", "如遺失流動電話，如何暫停及重新啟用戶口？"), ("Call the “iAM Smart” hotline, or use the account suspension function at a self-registration kiosk or registration service counter. To reactivate, register again with another mobile phone; the account on the old phone will be deleted.", "\"iAM Smart\" 상담전화로 연락하거나 키오스크·창구의 계정 정지 기능을 이용하세요. 다시 활성화하려면 다른 휴대폰으로 다시 가입하면 되며, 기존 휴대폰의 계정은 삭제됩니다.", "請致電「智方便」熱線，或到自助登記站或登記服務櫃位使用暫停戶口功能。如要重新啟用，可用另一部流動電話重新登記，舊手機上的戶口會被刪除。")),
        (("How can I transfer my account to another mobile phone?", "다른 휴대폰으로 계정을 어떻게 옮기나요?", "如何把戶口轉移至另一部流動電話？"), ("Use the “Transfer account to another mobile” function in the app on the existing phone, or rebind the account on the new phone. Upon success, the account on the original phone will be deleted.", "기존 휴대폰 앱의 \"다른 휴대폰으로 계정 이전\" 기능을 쓰거나 새 휴대폰에서 계정을 다시 연결하세요. 완료되면 원래 휴대폰의 계정은 삭제됩니다.", "請在現有手機的應用程式內使用「轉移戶口至另一部流動電話」功能，或在新手機重新綁定戶口。成功後，原有手機上的戶口會被刪除。")),
        (("How do I suspend or cancel my account?", "계정을 정지하거나 탈퇴하려면 어떻게 하나요?", "如何暫停或取消戶口？"), ("To de-register, use “De-register” under “Settings” > “Security & Privacy” in the app and confirm with biometric authentication or your password. Information saved in “e-ME” is kept for 12 months after suspension.", "탈퇴하려면 앱의 \"설정\" > \"보안·개인정보\" > \"탈퇴\"에서 생체 인증이나 비밀번호로 확인하세요. 계정 정지 후 \"e-ME\" 정보는 12개월간 보관됩니다.", "如要取消登記，請在應用程式「設定」>「保安及私隱」使用「取消登記」，並以生物認證或密碼確認。暫停戶口後，「e-ME」資料會保留12個月。")),
    ]),
    (("Personal Code", "개인 코드", "個人編碼"), [
        (("Will the Personal Code contain personal information?", "개인 코드에 개인정보가 들어 있나요?", "個人編碼會否載有個人資料？"), ("It contains your partial English name (e.g. CHOI Y** N**), age group (11-17, 18-64, 65 or above), a partial one-way hash value and the generation timestamp.", "일부만 보이는 영문 성명(예: CHOI Y** N**), 연령대(11~17, 18~64, 65세 이상), 일방향 해시값 일부, 생성 시각이 들어 있습니다.", "內含部分英文姓名（例如CHOI Y** N**）、年齡組別（11-17、18-64、65或以上）、部分單向雜湊值及產生時間。")),
    ]),
]
NEWS = [
    ("16-11-2026", ("Visa applications of the Immigration Department now support “iAM Smart”", "출입경사무처 비자 신청이 이제 \"iAM Smart\"를 지원합니다", "入境事務處簽證申請現已支援「智方便」")),
    ("02-11-2026", ("Online application for Smart Identity Card now supports “e-ME” form filling", "스마트 신분증 온라인 신청이 이제 \"e-ME\" 자동 작성을 지원합니다", "網上申領智能身份證現已支援「e-ME」填表")),
    ("20-10-2026", ("GovBHG online services now support login with “iAM Smart”", "정부포털 BHG 온라인 서비스가 이제 \"iAM Smart\" 로그인을 지원합니다", "「BHG政府一站通」網上服務現已支援以「智方便」登入")),
    ("01-03-2026", ("“iAM Smart” becomes the single portal for online government services", "\"iAM Smart\"가 온라인 정부 서비스 단일 창구가 되었습니다", "「智方便」成為網上政府服務的單一入口")),
]
P["contact"] = [
    ("table", [("", "", ""), ("", "", "")], [
        [("“iAM Smart” Hotline", "\"iAM Smart\" 상담전화", "「智方便」熱線"), ("182 123", "182 123", "182 123")],
        [("Email", "이메일", "電郵"), ("enquiry@iamsmart.bhg", "enquiry@iamsmart.bhg", "enquiry@iamsmart.bhg")],
        [("Service hours", "운영 시간", "服務時間"), ("Daily 8:00 – 20:00", "매일 8:00~20:00", "每日 8:00–20:00")],
    ]),
]
P["download"] = [
    ("p", ("The “iAM Smart” mobile app runs in your phone’s browser. Scan the QR code with your phone, or open the app on this device.", "\"iAM Smart\" 모바일 앱은 휴대폰 브라우저에서 실행됩니다. 휴대폰으로 QR 코드를 스캔하거나 이 기기에서 앱을 여세요.", "「智方便」流動應用程式在手機瀏覽器內運行。請用手機掃描二維碼，或在此裝置開啟應用程式。")),
    ("download", None),
]

SERVICES = [  # (organisation, service, target)
    (("Immigration Department", "출입경사무처", "入境事務處"), ("Online Application for Baekhyeon Hwarang SAR Passport", "백현화랑 특별행정구 여권 온라인 신청", "網上申請柏峴화랑特別行政區護照"), "immd:eservices/passport-application/loading"),
    (("Immigration Department", "출입경사무처", "入境事務處"), ("Online Application for Smart Identity Card", "스마트 신분증 온라인 신청", "網上申領智能身份證"), "immd:eservices/idcard-application/loading"),
    (("Immigration Department", "출입경사무처", "入境事務處"), ("Electronic Services for Visa Application", "비자 신청 전자 서비스", "簽證申請電子服務"), "immd:services/visas"),
    (("Immigration Department", "출입경사무처", "入境事務處"), ("Download “e-Visa”", "\"e-Visa\" 내려받기", "下載「電子簽證」"), "immd:eservices/evisa-download/loading"),
    (("Inland Revenue Department", "세무국", "稅務局"), ("eTAX – Individual Tax Portal", "eTAX – 개인 납세 포털", "稅務易 – 個人稅務入門網站"), "gov:eservices/etax-login"),
    (("GovBHG", "정부포털 BHG", "BHG政府一站通"), ("GovBHG one-stop portal", "정부포털 BHG", "BHG政府一站通"), "gov:"),
]
