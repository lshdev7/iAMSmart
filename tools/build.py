#!/usr/bin/env python3
"""Static site generator for "iAM Smart" (Baekhyeon Hwarang SAR): website in four languages + app/i18n.js.
python3 tools/build.py"""
import html
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import data as D            # noqa: E402
import app_strings as AS    # noqa: E402
import kiosk_strings as KS  # noqa: E402
from t2s_map import T2S, PHRASES  # noqa: E402

LANGS = [("en", "en", "English"), ("ko", "ko", "한국어"), ("zh-hant", "zh-Hant", "繁"), ("zh-hans", "zh-Hans", "简")]


def s2(text):
    for a, b in PHRASES:
        text = text.replace(a, b)
    return "".join(T2S.get(c, c) for c in text)


def g(tup, i):
    return s2(tup[2]) if i == 3 else tup[i]


def t(tup, i):
    return html.escape(g(tup, i))


def U(k, i):
    return t(D.UI[k], i)


def depth(p):
    return len([x for x in p.split("/") if x])


def rel(cur, target):
    up = "../" * (depth(cur) + 1)
    return up + LANGS_CUR[0] + "/" + (target + "/" if target else "")


LANGS_CUR = ["en"]


def href(cur, target, i):
    if target.startswith("gov:"):
        return D.GOV_BASE + LANGS[i][0] + "/" + (target[4:] + "/" if target[4:] else "")
    if target.startswith("immd:"):
        return D.IMMD_BASE + LANGS[i][0] + "/" + target[5:] + "/"
    return rel(cur, target)


def app_url(cur, i):
    return "../" * (depth(cur) + 1) + "app/?lang=" + LANGS[i][0]


ICON = {
    "how": '<svg viewBox="0 0 64 64"><rect x="6" y="14" width="22" height="36" rx="4" fill="#3aa79b"/><circle cx="44" cy="22" r="7" fill="#f2a33a"/><path d="M33 52c2-12 20-12 22 0z" fill="#5b6fd6"/><rect x="10" y="20" width="14" height="20" fill="#fff"/></svg>',
    "map": '<svg viewBox="0 0 64 64"><path d="M6 16l16-6 20 6 16-6v38l-16 6-20-6-16 6z" fill="#cfe7e3"/><path d="M22 10v38M42 16v38" stroke="#3aa79b" stroke-width="3"/><circle cx="32" cy="28" r="7" fill="#e2574c"/></svg>',
    "dl": '<svg viewBox="0 0 64 64"><rect x="18" y="4" width="28" height="52" rx="5" fill="#fff" stroke="#2b8a83" stroke-width="4"/><rect x="23" y="12" width="18" height="30" fill="#3aa79b"/><path d="M32 18v16m-6-6l6 6 6-6" stroke="#fff" stroke-width="3" fill="none"/></svg>',
    "regs": '<svg viewBox="0 0 64 64"><rect x="20" y="6" width="26" height="50" rx="5" fill="#fff" stroke="#333" stroke-width="3"/><circle cx="33" cy="24" r="6" fill="#e2574c"/><path d="M24 40c3-8 15-8 18 0" fill="#3aa79b"/><rect x="4" y="18" width="14" height="10" fill="#f2a33a"/></svg>',
    "uses": '<svg viewBox="0 0 64 64"><path d="M18 60l-6-20 10-6 10 10" fill="#f6b39a"/><rect x="24" y="4" width="22" height="40" rx="4" fill="#fff" stroke="#333" stroke-width="3"/><rect x="28" y="10" width="14" height="24" fill="#3aa79b"/></svg>',
    "svcs": '<svg viewBox="0 0 64 64"><rect x="10" y="20" width="44" height="30" rx="3" fill="#fff" stroke="#333" stroke-width="3"/><rect x="16" y="26" width="32" height="16" fill="#5b6fd6"/><circle cx="12" cy="12" r="5" fill="#3aa79b"/><circle cx="52" cy="10" r="4" fill="#f2a33a"/></svg>',
}


# ----------------------------------------------------------------------------- layout
def header(i, cur):
    items = []
    for slug, title, kids in D.NAV:
        if kids:
            sub = "".join('<li><a href="%s">%s</a></li>' % (rel(cur, s), t(tt, i)) for s, tt in kids)
            items.append('<li class="hasub"><span>%s</span><ul>%s</ul></li>' % (t(title, i), sub))
        else:
            items.append('<li><a href="%s">%s</a></li>' % (rel(cur, slug), t(title, i)))
    langs = "".join('<a href="%s"%s>%s</a>' % ("../" * (depth(cur) + 1) + c + "/" + (cur + "/" if cur else ""), ' class="on"' if k == i else "", n) for k, (c, _h, n) in enumerate(LANGS))
    return ('<header class="hd"><a class="logo" href="%s"><img src="%%A%%logo.svg" alt="%s"></a>'
            '<button type="button" class="burger" aria-label="%s" aria-expanded="false" aria-controls="menu"><span></span><span></span><span></span></button></header>'
            '<div class="menu" id="menu" hidden><div class="mtop"><div class="mtabs"><span class="on">%s</span><span>%s</span></div><div class="mlang">%s</div>'
            '<button type="button" class="mclose" aria-label="%s">×</button></div><nav><ul>%s</ul></nav>'
            '<a class="appbtn" href="%s">%s</a></div>'
            % (rel(cur, ""), U("site", i), U("menu", i), U("residents", i), U("orgs", i), langs, U("close", i), "".join(items), app_url(cur, i), U("openapp", i)))


def footer(i, cur):
    links = "".join('<a href="%s">%s</a>' % (rel(cur, "contact"), U(k, i)) for k in ("important", "privacy", "disclaimer", "copyright", "sitemap", "access"))
    return ('<footer class="ft"><div class="ftin"><div class="dpo"><img src="%%A%%flag.jpg" alt=""><div><b>%s</b><small>%s</small></div></div><div class="fl">%s</div></div>'
            '<a class="totop" href="#" aria-label="%s">︿</a></footer>' % (U("office", i), U("gov", i), links, U("top", i)))


def page(i, cur, title, body, home=False):
    hl = LANGS[i][1]
    up = "../" * (depth(cur) + 1)
    band = "" if home else '<div class="band"><h1>%s</h1></div>' % t(title, i)
    txt = ('<!doctype html><html lang="%s"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
           '<title>%s</title><link rel="icon" href="%%A%%favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="%%A%%site.css"></head>'
           '<body class="lang-%s%s">%s<main id="main">%s<div class="wrap%s">%s</div></main>%s'
           '<script src="%slib/config.js"></script><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js" integrity="sha384-GFr3yTh5lJznCbZfpTtXnwboFsxqtTQoeTZCRHhE0579KrRmlCzen5AA8ohaB5ug" crossorigin="anonymous"></script><script src="%slib/adapter-local.js"></script><script src="%slib/adapter-supabase.js"></script>'
           '<script src="%slib/ias-api.js"></script><script src="%slib/qrcode.js"></script><script src="%%A%%site.js"></script></body></html>'
           % (hl, html.escape(g(title, i) + ("" if home else " | " + g(D.UI["site"], i))), LANGS[i][0], " home" if home else "", header(i, cur), band,
              " homew" if home else " content", body, footer(i, cur), up, up, up, up, up))
    return txt.replace("%A%", up + "assets/")


# ----------------------------------------------------------------------------- blocks
def blocks(bl, i, cur):
    out = []
    for b in bl:
        k = b[0]
        if k == "p":
            out.append("<p>%s</p>" % t(b[1], i))
        elif k in ("h2", "h3"):
            out.append("<%s>%s</%s>" % (k, t(b[1], i), k))
        elif k in ("ul", "ol"):
            out.append("<%s>%s</%s>" % (k, "".join("<li>%s</li>" % t(x, i) for x in b[1]), k))
        elif k == "steps":
            out.append('<ol class="steps">%s</ol>' % "".join('<li><span>%d</span><p>%s</p></li>' % (n, t(x, i)) for n, x in enumerate(b[1], 1)))
        elif k == "table":
            hd = "".join("<th>%s</th>" % t(c, i) for c in b[1]) if any(c[0] for c in b[1]) else ""
            rows = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % t(c, i) for c in r) for r in b[2])
            out.append('<div class="tw"><table>%s<tbody>%s</tbody></table></div>' % ("<thead><tr>%s</tr></thead>" % hd if hd else "", rows))
        elif k == "cards":
            out.append('<div class="cards">%s</div>' % "".join('<div class="card" style="--c:%s"><b>%s</b><p>%s</p></div>' % (c, t(h, i), t(p, i)) for h, p, c in b[1]))
        elif k == "versions":
            feats = [(("Authentication", "인증", "認證"), "#e8710a", True, "&#9786;"), (("“e-ME” Form Filling", "\"e-ME\" 자동 작성", "「e-ME」填表"), "#7a9e0e", True, "✎"),
                     (("Personal Assistant", "개인 비서", "個人助理"), "#12a0c4", True, "☷"), (("Digital Signing", "전자서명", "數碼簽署"), "#b98d10", False, "✍")]
            rows = "".join('<div class="vr"><span class="vb" style="--c:%s">%s</span><span class="vf"><i style="background:%s">%s</i>%s</span><span class="vb" style="--c:%s">✓</span></div>'
                           % (c if basic else "#eee", "✓" if basic else '<em>✕</em>', c, gl, t(f, i), c) for f, c, basic, gl in feats)
            out.append('<div class="vers"><div class="vh"><img src="%%A%%logo.svg" alt="iAM Smart"><span></span><span class="plus"><img src="%%A%%logo.svg" alt="iAM Smart+"><b>+</b></span></div>%s</div>' % rows)
        elif k == "services":
            rows = "".join('<tr><td>%s</td><td><a href="%s">%s</a></td></tr>' % (t(o, i), href(cur, x, i), t(s, i)) for o, s, x in D.SERVICES)
            out.append('<div class="tw"><table><thead><tr><th>%s</th><th>%s</th></tr></thead><tbody>%s</tbody></table></div>'
                       % (t(("Organisation", "기관", "機構"), i), t(("Service", "서비스", "服務"), i), rows))
        elif k == "app":
            menu = ["personal_code", "digital_docs", "eme", "account_info", "todo", "app_status", "settings"]
            out.append('<div class="appmock"><div class="pm"><img src="%%A%%logo.svg" alt=""><ul>%s</ul></div><p><a class="cta" href="%s">%s</a></p></div>'
                       % ("".join("<li>%s</li>" % html.escape(g(AS.S[m], i)) for m in menu), app_url(cur, i), U("openapp", i)))
        elif k == "kiosk":
            out.append('<p><a class="cta" href="%skiosk/?lang=%s" target="_blank" rel="noopener">%s</a></p>' % ("../" * (depth(cur) + 1), LANGS[i][0], t(b[1], i)))
        elif k == "download":
            out.append('<div class="dl"><div class="qr" data-qr="app"></div><a class="cta" href="%s">%s</a></div>' % (app_url(cur, i), U("openapp", i)))
    return "".join(out)


def faq_page(i, cur):
    out = ['<p class="ftools"><button type="button" data-faq="open">%s</button><button type="button" data-faq="close">%s</button></p>' % (U("expand", i), U("collapse", i))]
    n = 0
    for cat, qs in D.FAQ:
        out.append("<h2>%s</h2><ul class=\"faq\">" % t(cat, i))
        for k, (q, a) in enumerate(qs, 1):
            n += 1
            out.append('<li><button type="button" class="q" aria-expanded="false">Q%d %s</button><div class="a" hidden><p>A%d %s</p></div></li>' % (k, t(q, i), k, t(a, i)))
        out.append("</ul>")
    out.insert(1, '<p class="total">%s</p>' % html.escape(g(D.UI["total"], i).replace("{n}", str(n))))
    return "".join(out)


def news_page(i, cur):
    return '<ul class="news">%s</ul>' % "".join('<li><time>%s</time><span>%s</span></li>' % (d, t(x, i)) for d, x in D.NEWS)


def home(i, cur):
    slides = "".join('<div class="slide%s" style="--c:%s"><a href="%s"><span>%s</span></a></div>' % (" on" if n == 0 else "", c, href(cur, x, i), t(s, i)) for n, (s, c, x) in enumerate(D.SLIDES))
    dots = "".join('<button type="button" class="%s" aria-label="%d"></button>' % ("on" if n == 0 else "", n + 1) for n in range(len(D.SLIDES)))
    tiles = "".join('<a class="tile%s" href="%s"><i>%s</i><span>%s</span></a>' % (" tall" if ic == "dl" else "", rel(cur, s), ICON[ic], t(tt, i)) for s, tt, ic in D.TILES)
    stats = "".join('<div class="stat"><i>%s</i><span>%s</span><b data-stat="%s">–</b></div>' % (ICON[k], t(tt, i), k) for tt, k in D.STATS)
    return ('<section class="panel"><div class="slider"><button type="button" class="prev" aria-label="prev">‹</button>%s<button type="button" class="nextb" aria-label="next">›</button>'
            '<div class="dots">%s</div></div><div class="side"><div class="tiles">%s</div><div class="stats" data-svcs="%d">%s</div></div></section>'
            % (slides, dots, tiles, len(D.SERVICES), stats))


# ----------------------------------------------------------------------------- app strings
def write_i18n():
    out = {}
    for i, (code, _h, _n) in enumerate(LANGS):
        d = {k: g(v, i) for k, v in AS.S.items()}
        d["SERVICES"] = [{"org": g(o, i), "name": g(s, i), "href": href("", x, i)} for o, s, x in D.SERVICES]
        out[code] = d
    with open(os.path.join(ROOT, "app", "i18n.js"), "w", encoding="utf-8") as f:
        f.write("/* Generated by tools/build.py - do not edit. */\nwindow.IAS_I18N = " + json.dumps(out, ensure_ascii=False, indent=0) + ";\n")
    with open(os.path.join(ROOT, "app", "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"name": "iAM Smart", "short_name": "iAM Smart", "start_url": "./", "display": "standalone", "background_color": "#f3f6f8", "theme_color": "#2b8a83",
                   "icons": [{"src": "../assets/favicon.svg", "sizes": "any", "type": "image/svg+xml"}]}, f, ensure_ascii=False, indent=1)


def kiosk_i18n():
    out = {code: {k: g(v, i) for k, v in KS.S.items()} for i, (code, _h, _n) in enumerate(LANGS)}
    with open(os.path.join(ROOT, "kiosk", "i18n.js"), "w", encoding="utf-8") as f:
        f.write("/* Generated by tools/build.py - do not edit. */\nwindow.IAS_KIOSK_I18N = " + json.dumps(out, ensure_ascii=False, indent=0) + ";\n")


def stamp_app():
    """Add ?v=<build time> to the app's own scripts and stylesheet so that phones do not keep stale copies."""
    import re
    import time
    v = str(int(time.time()))
    for d in ("app", "kiosk"):
        p = os.path.join(ROOT, d, "index.html")
        s = open(p, encoding="utf-8").read()
        s = re.sub(r'((?:src|href)="(?:\.\./lib/[^"?]+|\.\./assets/[^"?]+|[\w]+\.(?:js|css)|/bhg_Immigration_Department/assets/[^"?]+))(?:\?v=\d+)?"', r'\1?v=' + v + '"', s)
        open(p, "w", encoding="utf-8").write(s)


def main():
    pages = [""] + [s for _s, _t, kids in D.NAV for s, _x in kids] + [s for s, _t, kids in D.NAV if s] + ["download"]
    n = 0
    for i, (code, _h, _n) in enumerate(LANGS):
        LANGS_CUR[0] = code
        shutil.rmtree(os.path.join(ROOT, code), ignore_errors=True)
        for p in pages:
            if p == "":
                txt = page(i, p, D.UI["site"], home(i, p), home=True)
            elif p == "faq":
                txt = page(i, p, D.TITLES[p], faq_page(i, p))
            elif p == "news":
                txt = page(i, p, D.TITLES[p], news_page(i, p))
            else:
                txt = page(i, p, D.TITLES[p], blocks(D.P.get(p, []), i, p) + '<p class="rev">%s</p>' % U("rev", i))
            d = os.path.join(ROOT, code, p)
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
                f.write(txt)
            n += 1
    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
        f.write('<!doctype html><html><head><meta charset="utf-8"><title>iAM Smart</title><script>(function(){var l=(navigator.language||"en").toLowerCase();'
                'location.replace((l.indexOf("ko")===0?"ko":l==="zh-cn"||l==="zh-sg"||l==="zh-hans"?"zh-hans":l.indexOf("zh")===0?"zh-hant":"en")+"/");})();</script>'
                '</head><body><a href="en/">iAM Smart</a></body></html>')
    write_i18n()
    kiosk_i18n()
    stamp_app()
    open(os.path.join(ROOT, ".nojekyll"), "w").close()
    print("built %d pages (%d per language) + app/i18n.js" % (n, len(pages)))


if __name__ == "__main__":
    main()
