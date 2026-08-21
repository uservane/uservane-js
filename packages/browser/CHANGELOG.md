# @uservane/browser

## 0.1.2

### Patch Changes

- 2cb07af: Add npm keywords so the packages are findable by search.

  All nine shipped with none, which meant npm search, itself a catalogue we were
  already listed in, could not surface them for the terms people actually type:
  langfuse, agent-feedback, vercel-ai-sdk, copilotkit, nps, csat. Keywords are
  metadata only and change no behaviour, but they only take effect on publish.

## 0.1.1

### Patch Changes

- 317a8f1: Stop the host page's CSS painting the widget's mount element.

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
