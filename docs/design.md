# Visual direction and QA

User requirement: avoid a generic AI-made appearance and research how to achieve that.

References reviewed:
- https://www.nngroup.com/articles/principles-visual-design/ — hierarchy, scale, balance and contrast.
- https://www.nngroup.com/articles/common-region/ — whitespace as grouping.
- https://design-system.service.gov.uk/components/table/ — numeric table alignment and accessible structure.

Design decisions: editorial serif headlines with a practical sans-serif interface; warm paper, dark ink and a restrained rust accent; one compact financial note as the hero illustration; thin rules and tabular figures; numbered sections; real product controls on the page. No fabricated logos, reviews, user counts or growth claims. The visual treatment is original rather than copied from a reference site.

Browser QA: 1280px desktop hero reviewed visually; client editor opened and saved with expected recalculation; 390px mobile review inspected visually; page width equals viewport width (390px), while the 718px financial table scrolls inside its container. Desktop viewport restored after testing. Print styling exists but physical/PDF pagination has not yet been verified. CSV logic is unit-tested; native browser file upload/download flows remain to be tested end to end.

User refinement: removed decorative arrows from the brand, navigation, primary calls to action and print control. Retained CSV import/export direction indicators.
