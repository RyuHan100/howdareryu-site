import { i18n } from "../i18n"
import { FullSlug, getFileExtension, joinSegments, pathToRoot } from "../util/path"
import { CSSResourceToStyleElement, JSResourceToScriptElement } from "../util/resources"
import { googleFontHref, googleFontSubsetHref } from "../util/theme"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { unescapeHTML } from "../util/escape"
import { CustomOgImagesEmitterName } from "../../.quartz/plugins"
export default (() => {
  const Head: QuartzComponent = ({
    cfg,
    fileData,
    externalResources,
    ctx,
  }: QuartzComponentProps) => {
    const titleSuffix = cfg.pageTitleSuffix ?? ""
    const title =
      (fileData.frontmatter?.title ?? i18n(cfg.locale).propertyDefaults.title) + titleSuffix
    const description =
      fileData.frontmatter?.socialDescription ??
      fileData.frontmatter?.description ??
      unescapeHTML(fileData.description?.trim() ?? i18n(cfg.locale).propertyDefaults.description)

    const { css, js, additionalHead } = externalResources

    const url = new URL(`https://${cfg.baseUrl ?? "example.com"}`)
    const path = url.pathname as FullSlug
    const baseDir = fileData.slug === "404" ? path : pathToRoot(fileData.slug!)
    const iconPath = joinSegments(baseDir, "static/icon.png")

    // Url of current page
    const socialUrl =
      fileData.slug === "404" ? url.toString() : joinSegments(url.toString(), fileData.slug!)

    const usesCustomOgImage = ctx.cfg.plugins.emitters.some(
      (e) => e.name === CustomOgImagesEmitterName,
    )
    const ogImageDefaultPath = `https://${cfg.baseUrl}/static/og-image.png`

    const coreStylesheet = css[0]?.content
    const coreScript = js.find(
      (r) => r.loadTime === "beforeDOMReady" && r.contentType === "external",
    )

    return (
      <head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        {coreStylesheet && <link rel="preload" href={coreStylesheet} as="style" />}
        {coreScript && coreScript.contentType === "external" && (
          <link rel="preload" href={coreScript.src} as="script" />
        )}
        {cfg.theme.cdnCaching && cfg.theme.fontOrigin === "googleFonts" && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" />
            <link rel="stylesheet" href={googleFontHref(cfg.theme)} />
            {cfg.theme.typography.title && (
              <link rel="stylesheet" href={googleFontSubsetHref(cfg.theme, cfg.pageTitle)} />
            )}
          </>
        )}
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="anonymous" />
        {/* 본문 타이포그래피용 MaruBuri 웹폰트(custom.scss의 @font-face) — 네이버가 배포하는
            공개 한글 폰트 CDN, otterletter.com 도 같은 방식으로 직접 호스팅한다. */}
        <link rel="preconnect" href="https://hangeul.pstatic.net" crossOrigin="anonymous" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        <meta name="og:site_name" content={cfg.pageTitle}></meta>
        <meta property="og:title" content={title} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta property="og:description" content={description} />
        <meta property="og:image:alt" content={description} />

        {!usesCustomOgImage && (
          <>
            <meta property="og:image" content={ogImageDefaultPath} />
            <meta property="og:image:url" content={ogImageDefaultPath} />
            <meta name="twitter:image" content={ogImageDefaultPath} />
            <meta
              property="og:image:type"
              content={`image/${getFileExtension(ogImageDefaultPath) ?? "png"}`}
            />
          </>
        )}

        {cfg.baseUrl && (
          <>
            <meta property="twitter:domain" content={cfg.baseUrl}></meta>
            <meta property="og:url" content={socialUrl}></meta>
            <meta property="twitter:url" content={socialUrl}></meta>
          </>
        )}

        <link rel="icon" href={iconPath} />
        <meta name="description" content={description} />
        <meta name="generator" content="Quartz" />

        {css.map((resource) => CSSResourceToStyleElement(resource, true))}
        {js
          .filter((resource) => resource.loadTime === "beforeDOMReady")
          .map((res) => JSResourceToScriptElement(res, true))}
        {/* 텍스트 읽어주기(TTS): 제목 아래 버튼 + 하단 플로팅 버튼. 원본은 Scripts/Text2Speech.
            data-persist 가 있어야 SPA 이동 때 head 에서 지워지지 않는다.
            홈(index)에서만 숨긴다 — 2026-09-22 사용자 결정, CLAUDE.md §9. 다른 모든 노트 페이지는 그대로. */}
        {fileData.slug !== "index" && (
          <>
            <script
              defer
              data-persist="true"
              src={joinSegments(baseDir, "static/tts/tts-core.js")}
            ></script>
            <script
              defer
              data-persist="true"
              src={joinSegments(baseDir, "static/tts/tts-site.js")}
            ></script>
          </>
        )}
        {/* 노트 상단 Properties 표를 정원 콘셉트 이름으로 갈아 끼운다(§7, garden.yaml 의
            properties 항목). 데이터 스크립트가 먼저 로드돼야 하므로 순서를 지킨다.
            홈(index)에는 Properties 표 자체가 없어 의미가 없으므로 같이 숨긴다. */}
        {fileData.slug !== "index" && (
          <>
            <script
              defer
              data-persist="true"
              src={joinSegments(baseDir, "static/garden-properties-data.js")}
            ></script>
            <script
              defer
              data-persist="true"
              src={joinSegments(baseDir, "static/garden-properties.js")}
            ></script>
          </>
        )}
        {/* 용어집 인라인 연동 — 본문의 .glossary-ref(plugins/glossary-linker) 위에 호버 툴팁을
            띄운다. 데이터 스크립트가 먼저 로드돼야 하므로 순서를 지킨다. 홈에는 본문이
            markdown 파이프라인을 안 거쳐 .glossary-ref 가 생길 일이 없어 같이 뺀다. */}
        {fileData.slug !== "index" && (
          <>
            <script
              defer
              data-persist="true"
              src={joinSegments(baseDir, "static/glossary-terms-data.js")}
            ></script>
            <script
              defer
              data-persist="true"
              src={joinSegments(baseDir, "static/glossary-tooltip.js")}
            ></script>
          </>
        )}
        {additionalHead.map((resource) => {
          if (typeof resource === "function") {
            return resource(fileData)
          } else {
            return resource
          }
        })}
      </head>
    )
  }

  return Head
}) satisfies QuartzComponentConstructor
