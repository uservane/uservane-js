---
"@uservane/browser": patch
---

Stop the host page's CSS painting the widget's mount element.

The shadow root protects the widget's contents but not the element the shadow
is attached to, which lives in the host page's light DOM and is matched by the
host's own selectors. On a site with a global rule such as
`div { border: 2px dashed; padding: 9px }`, that element rendered as a stray
empty box in the page flow, above their content.

The mount element now sets `display: contents` as a priority declaration, so it
generates no box for a host rule to paint or lay out, while font inheritance
still passes through to the shadow content as before.

Found by mounting the widget on a deliberately hostile page in a real browser.
A mocked DOM has no cascade and no layout, so the element was correct in
structure and wrong on screen.
