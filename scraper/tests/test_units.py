"""Unit-Tests für Parser, Normalizer, Typ-/Referenz-Erkennung und Pipeline-Hashing.

Ausführen:  python3 -m unittest discover -s tests -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from regradar.adapters.base import strip_html
from regradar.adapters.rss import _links_from_html, _parse_date, extract_reference, refine_type
from regradar.adapters.rii import _to_iso
from regradar.adapters.amla import DATE_RE, _iso
from regradar.models import CanonicalDocument
from regradar.pipeline import _normalized_hash


class TypeRefinement(unittest.TestCase):
    def test_consultation_de(self):
        self.assertEqual(refine_type("BaFin startet Konsultation 08/2026", "OTHER"), "CONSULTATION")

    def test_circular(self):
        self.assertEqual(refine_type("Rundschreiben 05/2026 (BA) – MaRisk", "OTHER"), "CIRCULAR")

    def test_guideline_en(self):
        self.assertEqual(refine_type("EBA publishes final Guidelines on loan origination", "OTHER"), "GUIDELINE")

    def test_default_kept(self):
        self.assertEqual(refine_type("Monatsbericht August", "CIRCULAR"), "CIRCULAR")


class FrameworkClassification(unittest.TestCase):
    """MaRisk (Banken), WpI MaRisk (Wertpapierinstitute) und KAMaRisk (KVGen)
    sind eigenständige Regelwerke und dürfen nicht vermischt werden."""

    def test_banken_marisk(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("Rundschreiben 06/2026 (BA) – Mindestanforderungen an das Risikomanagement – MaRisk"), "marisk")

    def test_wpi_marisk(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("Rundschreiben 09/2026 (WA) - WpI MaRisk"), "wpimarisk")

    def test_marisk_fuer_wertpapierinstitute(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("Bafin veröffentlicht MaRisk für Kleine und Mittlere Wertpapierinstitute"), "wpimarisk")

    def test_ka_marisk(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("Konsultation zur KAMaRisk – Mindestanforderungen an das Risikomanagement von Kapitalverwaltungsgesellschaften"), "aifmd2")


class ReferenceExtraction(unittest.TestCase):
    def test_eba_reference(self):
        self.assertEqual(extract_reference("Final report EBA/GL/2026/05 published"), "EBA/GL/2026/05")

    def test_bafin_rundschreiben(self):
        self.assertEqual(extract_reference("Rundschreiben 05/2026 (BA)"), "05/2026")

    def test_none(self):
        self.assertIsNone(extract_reference("Allgemeine Meldung ohne Referenz"))


class DateParsing(unittest.TestCase):
    def test_rfc822(self):
        self.assertEqual(_parse_date("Mon, 24 Aug 2026 10:00:00 +0200"), "2026-08-24")

    def test_german(self):
        self.assertEqual(_parse_date("24.08.2026"), "2026-08-24")

    def test_rii_german_to_iso(self):
        self.assertEqual(_to_iso("19.08.2026"), "2026-08-19")

    def test_desc_date_fallback_esma(self):
        # ESMA-Feed hat kein pubDate; Datum steckt im <time>-Tag der Description.
        from regradar.adapters.rss import DESC_DATE_RE
        desc = ('<span class="field--name-created"><time datetime="2026-08-14T10:54:44+02:00" '
                'class="datetime">14 August 2026</time></span>')
        m = DESC_DATE_RE.search(desc)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "2026-08-14")

    def test_amla_english_date(self):
        m = DATE_RE.search("Published on 3 July 2026 by AMLA")
        self.assertIsNotNone(m)
        self.assertEqual(_iso(m.group(1), m.group(2), m.group(3)), "2026-07-03")


class HtmlHandling(unittest.TestCase):
    def test_strip_html_removes_nav_and_tags(self):
        html = "<nav>Menu</nav><p>Artikel&nbsp;1 &amp; 2</p><script>x()</script>"
        text = strip_html(html)
        self.assertNotIn("Menu", text)
        self.assertNotIn("x()", text)
        self.assertIn("Artikel 1 & 2", text)

    def test_links_from_html(self):
        frag = '&lt;a href="https://x.eu/doc"&gt;&lt;b&gt;Final  Report&lt;/b&gt;&lt;/a&gt;'
        pairs = _links_from_html(frag)
        self.assertEqual(pairs, [("https://x.eu/doc", "Final Report")])


class NormalizedHashing(unittest.TestCase):
    def _doc(self, **kw):
        base = dict(source_id="s", external_id="e", title="T", document_type="LAW",
                    authority="A", jurisdiction="DE", canonical_url="u")
        base.update(kw)
        return CanonicalDocument(**base)

    def test_same_content_same_hash(self):
        self.assertEqual(_normalized_hash(self._doc(full_text="abc")),
                         _normalized_hash(self._doc(full_text="abc")))

    def test_changed_text_changes_hash(self):
        self.assertNotEqual(_normalized_hash(self._doc(full_text="abc")),
                            _normalized_hash(self._doc(full_text="abd")))

    def test_irrelevant_field_ignored(self):
        a = self._doc(full_text="abc")
        b = self._doc(full_text="abc")
        b.canonical_url = "https://andere-url.example"     # nicht Teil der fachlichen Basis
        self.assertEqual(_normalized_hash(a), _normalized_hash(b))


class Rss10Rdf(unittest.TestCase):
    """BIS liefert RSS 1.0/RDF: Items im RSS-1.0-Namespace, Datum in dc:date."""
    FEED = (
        '<rdf:RDF xmlns="http://purl.org/rss/1.0/" '
        'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/">'
        '<item rdf:about="https://www.bis.org/bcbs/publ/d611.htm">'
        '<title>ICT risk management</title>'
        '<link>https://www.bis.org/bcbs/publ/d611.htm</link>'
        '<dc:date>2026-06-02T08:00:00Z</dc:date></item></rdf:RDF>')

    def test_namespaced_items_found(self):
        import xml.etree.ElementTree as ET
        from regradar.adapters.rss import _childtext, _iter_items
        items = list(_iter_items(ET.fromstring(self.FEED)))
        self.assertEqual(len(items), 1)
        self.assertEqual(_childtext(items[0], "title"), "ICT risk management")
        self.assertEqual(_parse_date(_childtext(items[0], "date")), "2026-06-02")


class EbaQnaParsing(unittest.TestCase):
    def test_published_status_and_date(self):
        from regradar.adapters.ebaqna import PUBLISHED_RE
        m = PUBLISHED_RE.search('<b>Published as Rejected Q&amp;A: </b> 05/08/2026')
        self.assertEqual(m.group(1).strip(), "Rejected Q&amp;A")
        self.assertEqual((m.group(4), m.group(3), m.group(2)), ("2026", "08", "05"))


class IoscoParsing(unittest.TestCase):
    ITEM = ('<li> <strong>FR/05/2026 World Investor Week 2025</strong>, Report of IOSCO '
            'Committee <br /> <span style="color: 0D314B;"> 09 Jul 2026 </span> - '
            '<a href="/library/pubdocs/pdf/IOSCOPD827.pdf" target="_blank">View Report</a> </li>')

    def test_item_regex(self):
        from regradar.adapters.iosco import ITEM_RE, REF_RE
        m = ITEM_RE.search(self.ITEM)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(7), "IOSCOPD827")
        self.assertEqual((m.group(3), m.group(4), m.group(5)), ("09", "Jul", "2026"))
        self.assertEqual(REF_RE.match("FR/05/2026 World Investor Week").group(1), "FR/05/2026")


if __name__ == "__main__":
    unittest.main()
