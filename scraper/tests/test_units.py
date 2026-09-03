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

    def test_zag_marisk(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("Rundschreiben 07/2024 (BA) – Mindestanforderungen an das Risikomanagement von ZAG-Instituten – ZAG-MaRisk"), "zagmarisk")
        self.assertEqual(_classify("Erstmals MaRisk für Zahlungs- und E-Geld-Institute"), "zagmarisk")

    def test_zag_merkblatt_vor_psd3(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("Merkblatt – Hinweise zum Zahlungsdiensteaufsichtsgesetz (ZAG)"), "zag")
        self.assertEqual(_classify("PSD3: Rat legt Verhandlungsposition zur Zahlungsdiensterichtlinie fest"), "psd3")

    def test_zkg_beschwerde_lieferkette(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("BaFin: Anspruch auf ein Basiskonto nach dem Zahlungskontengesetz"), "zkg")
        self.assertEqual(_classify("BaFin aktualisiert Rundschreiben 06/2018 zum Beschwerdemanagement"), "complaints")
        self.assertEqual(_classify("Bundestag berät Änderung des Lieferkettensorgfaltspflichtengesetzes"), "lksg")
        self.assertEqual(_classify("Kommission veröffentlicht Bericht zur Interchange Fee Regulation für Kartenzahlungen"), "interchange")
        self.assertEqual(_classify("EBA final report on IFR own funds requirements for investment firms"), "ifr")

    def test_macomp_und_sanktionen(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("BaFin aktualisiert MaComp-Rundschreiben"), "macomp")
        self.assertEqual(_classify("EU beschließt 19. Sanktionspaket gegen Russland"), "sanctions")

    def test_absfinag_irrd_taxonomie(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("Formular für Kreditgeber zum Antrag auf Registrierung nach dem AbsFinAG"), "absfinag")
        self.assertEqual(_classify("Entscheidungsbaum zu Registrierungs- und Meldepflichten nach dem Absatzfinanzierungsaufsichtsgesetz"), "absfinag")
        self.assertEqual(_classify("Consultation on the proposal for Guidelines on criteria for the identification of critical functions - IRRD"), "irrd")
        # Abwicklungsfähigkeit ist seit den Kind-Rahmenwerken eine eigene EBA-Leitlinie.
        self.assertEqual(_classify("EBA consults on resolvability under BRRD"), "ebaresolvability")
        # Seit 03.09.2026 eigenes Rahmenwerk "taxonomy" (vorher unter SFDR).
        self.assertEqual(_classify("Consultation on the review of insurance disclosures under the Taxonomy Disclosures Delegated Act"), "taxonomy")

    def test_neue_rahmenwerke_2026(self):
        """Gap-Analyse 03.09.2026: Spezialregime greifen vor den generischen Mustern."""
        from regradar.webexport import _classify
        cases = [
            ("Retail Investment Strategy: Council endorses final compromise text", "ris"),
            ("Kleinanlegerstrategie: Parlament stimmt über Value for Money ab", "ris"),
            ("Delegated act on simplification of the EU Taxonomy published", "taxonomy"),
            ("ESMA statement on ESG rating providers transition period", "esgrating"),
            ("ESMA registers first external reviewers under the European Green Bond Regulation", "greenbond"),
            ("European Parliament backs negotiating mandate on the digital euro", "digieuro"),
            ("BaFin veröffentlicht Neufassung der MaGo für Versicherer", "mago"),
            ("EBA final Guidelines on the management of ESG risks", "ebaesg"),
            ("ECON adopts position on the securitisation framework review", "securitisation"),
            ("Commission publishes guidance on the Cyber Resilience Act reporting obligations", "cra"),
            ("BaFin: Erlaubnisverfahren nach dem Kreditzweitmarktgesetz", "krzwmg"),
            ("ECB announces main milestones for roll-out of Integrated Reporting Framework", "iref"),
            ("ICMA updates SFTR reporting recommendations", "sftr"),
            ("EBA Guidelines on loan origination and monitoring: compliance table", "loanorig"),
            ("EBA and ESMA consult on revised joint Guidelines on the suitability of members of the management body", "fitproper"),
            ("Commission consultation on the Mortgage Credit Directive review", "mcd"),
            ("Pfandbriefgesetz: Änderung der Beleihungswertermittlungsverordnung", "pfandbg"),
            ("Data Act: Commission guidance on cloud switching", "dataact"),
            # Bestehende Zuordnungen bleiben stabil.
            ("EBA reporting framework 4.1 – Taxonomy package published", "itsrep"),
            ("The EBA releases the final technical package for its 4.3 reporting framework", "itsrep"),
            ("The EBA seeks feedback on the 4.4 draft technical package of its reporting and disclosure framework", "itsrep"),
            # Generisches "reporting framework" ohne EBA-Kontext gehört nicht ins Meldewesen.
            ("ESMA consults on reporting framework for clearing activity at recognised third-country CCPs under EMIR", "emir"),
            ("EBA Q&A: validation rule on template C 34.03 of the reporting framework", "itsrep"),
            ("EIOPA publishes second public working draft of the Solvency II 2.10.0 DPM and taxonomy", "solvency"),
            ("ESMA guidelines on MiFID II suitability requirements", "mifid"),
            ("EBA consults on LCR and NSFR treatment under the banking package", "crr3"),
        ]
        for text, expected in cases:
            self.assertEqual(_classify(text), expected, text)

    def test_cssf_quellenregeln(self):
        """CSSF-Dokumente werden ausschließlich den luxemburgischen Rahmenwerken
        zugeordnet; EU-Weiterleitungen (DORA, ESMA) entfallen."""
        from regradar.webexport import _classify
        self.assertEqual(_classify("Circular CSSF 26/910 – ESMA Guidelines on Liquidity Management Tools", source_id="cssf"), "lulmt")
        self.assertEqual(_classify("Circular CSSF 24/856 – Protection of investors in case of NAV calculation error", source_id="cssf"), "cssf24856")
        self.assertEqual(_classify("Circular CSSF 22/806 (as amended) on outsourcing arrangements", source_id="cssf"), "cssf18698")
        self.assertEqual(_classify("FAQ on AML/CFT asset due diligence obligations in accordance with CSSF Regulation No 12-02", source_id="cssf"), "cssfaml")
        self.assertEqual(_classify("Communication to the investment fund industry – Law of 3 March 2026", source_id="cssf"), "luaifm")
        self.assertIsNone(_classify("Application of the Digital Operational Resilience Act (DORA) to third-country branches", source_id="cssf"))
        self.assertIsNone(_classify("Public consultation by ESMA on simplifying EU Taxonomy disclosure framework", source_id="cssf"))
        # Ohne Quellenkontext greifen die Lux-Regeln nicht.
        self.assertEqual(_classify("ESMA Guidelines on Liquidity Management Tools of UCITS"), "aifmd2")

    def test_umgangssprachliche_begriffe(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("Kommission veröffentlicht Leitlinien zum EU AI Act für Hochrisiko-KI"), "aiact")
        self.assertEqual(_classify("EBA publishes KYC guidance on beneficial owners"), "gwg")
        self.assertEqual(_classify("Bundesbank informiert über neues Sanktionspaket – Sanktionen gegen Russland"), "sanctions")
        self.assertEqual(_classify("ESMA statement on greenwashing risks"), "sfdr")
        self.assertEqual(_classify("EIOPA opinion on ORSA supervision of insurance undertakings"), "solvency")
        self.assertEqual(_classify("EBA consults on LCR and NSFR treatment under the banking package"), "crr3")
        self.assertEqual(_classify("Bafin: Widerrufsrecht bei Verbraucherdarlehen"), "consumer")
        self.assertEqual(_classify("Payment Services Regulation: Rat einigt sich auf PSR-Text"), "psd3")


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


class Big4MatchWindow(unittest.TestCase):
    def test_window(self):
        from regradar.big4 import _within_window
        self.assertTrue(_within_window("2026-07-20", "2026-07-28"))
        self.assertTrue(_within_window("2026-08-10", "2026-07-28"))   # +13 Tage
        self.assertFalse(_within_window("2026-08-12", "2026-07-28"))  # +15 Tage
        self.assertFalse(_within_window("2024-07-12", "2026-07-28"))  # 2 Jahre
        self.assertFalse(_within_window(None, "2026-07-28"))          # ohne Artikeldatum
        self.assertTrue(_within_window(None, None))                   # ohne Meldungsdatum
        self.assertFalse(_within_window("kaputt", "2026-07-28"))


class DsNewsParsing(unittest.TestCase):
    BLOCK = ('<article class="ecl-content-item"><div>'
             '<ul class="ecl-content-block__primary-meta-container">'
             '<li class="ecl-content-block__primary-meta-item">Press release</li>'
             '<li class="ecl-content-block__primary-meta-item">31 July 2026</li></ul>'
             '<div class="ecl-content-block__title"><a\n'
             '  href="/en/news/commission-starts-enforcing-ai-act-rules" class="ecl-link"\n'
             '   data-ecl-title-link\n'
             '><span>Commission starts enforcing AI Act rules</span></a></div></div></article>')

    def test_block_regexes(self):
        from regradar.adapters.dsnews import DATE_RE, META_ITEM_RE, META_RE, TITLE_RE
        tm = TITLE_RE.search(self.BLOCK)
        self.assertEqual(tm.group(1), "/en/news/commission-starts-enforcing-ai-act-rules")
        self.assertEqual(tm.group(2), "Commission starts enforcing AI Act rules")
        items = META_ITEM_RE.findall(META_RE.search(self.BLOCK).group(1))
        self.assertEqual(items, ["Press release", "31 July 2026"])
        dm = DATE_RE.search(items[1])
        self.assertEqual((dm.group(1), dm.group(2), dm.group(3)), ("31", "July", "2026"))


class PraxisSummary(unittest.TestCase):
    """Satz-Kürzung für Praxis-Kurztexte: Punkte in Zahlen (Tausenderpunkt)
    sind keine Satzgrenzen — Regression für den Wise-Europe-Fall, bei dem
    aus '… 16.000 Euro festgesetzt' nur '000 Euro festgesetzt' übrig blieb."""

    LONG_TAIL = (" Noch ein weiterer Satz, der deutlich über das Limit"
                 " hinausführt und deshalb bei der Kürzung wegfallen muss,"
                 " damit der Grenzfall überhaupt eintritt und die Kürzung"
                 " auf ganze Sätze sichtbar wird und wirklich greift.")

    def test_thousands_separator_not_a_sentence_end(self):
        from regradar.webexport import _praxis_summary
        text = ("Die Finanzaufsicht Bafin hat Bußgelder in Höhe von insgesamt "
                "16.000 Euro festgesetzt. Grund dafür sind unterlassene "
                "Meldungen an den Bafin-Kontenvergleich." + self.LONG_TAIL * 3)
        out = _praxis_summary(text, limit=200)
        self.assertTrue(out.startswith("Die Finanzaufsicht"))
        self.assertIn("16.000 Euro", out)
        self.assertTrue(out.endswith("Bafin-Kontenvergleich."))

    def test_short_text_unchanged(self):
        from regradar.webexport import _praxis_summary
        self.assertEqual(_praxis_summary("Kurzer Text.", limit=200),
                         "Kurzer Text.")

    def test_suspicious_start_heuristic(self):
        from regradar.qacheck import _suspicious_start
        self.assertTrue(_suspicious_start("000 Euro festgesetzt."))
        self.assertTrue(_suspicious_start("und weitere Verstöße."))
        self.assertFalse(_suspicious_start("Die BaFin hat ein Bußgeld "
                                           "festgesetzt."))
        self.assertFalse(_suspicious_start("„Zitat“ am Anfang."))


if __name__ == "__main__":
    unittest.main()


class QaSweepSept2026(unittest.TestCase):
    """Befunde der Oberflächenprüfung vom 03.09.2026."""

    def test_offtopic_legislation(self):
        from regradar.webexport import _classify
        for title in (
            "Anordnung zur Übertragung der Zuständigkeit für Widerspruchsbescheide aus dem Beamtenverhältnis Verbraucherschutz",
            "Gesetz zur Änderung des Energiewirtschaftsrechts zur Stärkung des Verbraucherschutzes im Energiebereich",
            "Gesetz zur Änderung des Agrarstatistikgesetzes und des Agrarorganisationen-und-Lieferketten-Gesetzes",
        ):
            self.assertIsNone(_classify(title, source_id="bgbl"), title)
        # Finanzrecht bleibt zugeordnet; andere Quellen unberührt.
        self.assertEqual(_classify("Gesetz zur Umsetzung der Richtlinie (EU) 2023/2225 über Verbraucherkreditverträge", source_id="bgbl"), "consumer")
        self.assertEqual(_classify("Lieferkettensorgfaltspflichten: EU-Kommission zum Omnibus", source_id="ec_fisma"), "lksg")
        # Fachfremd-Filter nur auf den Titel: Teaser des ZKG nennt Asylsuchende.
        self.assertEqual(_classify("Zahlungskontengesetz: Basiskonto auch für Asylsuchende und Geduldete", source_id="dip", title="Gesetz zur Umsetzung der Zahlungskontenrichtlinie"), "zkg")

    def test_eba_qna_insurance_holdings_is_crr(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("Exemption from the deduction of holdings in insurance undertakings under Article 471 CRR", source_id="eba_qna"), "crr3")
        self.assertEqual(_classify("Validation rule v90317_m COREP C 16.02", source_id="eba_qna"), "itsrep")

    def test_cssf_only_luxembourg_frameworks(self):
        """CSSF-Dokumente landen nur in luxemburgischen Rahmenwerken; EU-Weiter-
        leitungen (DORA, MiCA, FATF/EBA) entfallen, die kommen über die EU-Quellen."""
        from regradar.webexport import _classify
        self.assertIsNone(_classify("Public Consultation on AML/CFT and Financial Inclusion - Updated FATF Guidance", source_id="cssf"))
        self.assertIsNone(_classify("The European Banking Authority consults on new rules related to the anti-money laundering package", source_id="cssf"))
        self.assertIsNone(_classify("Circular CSSF 25/893 Reporting of major ICT-related incidents under DORA", source_id="cssf"))
        self.assertIsNone(_classify("Notification of white papers under Title II of MiCAR", source_id="cssf"))
        self.assertEqual(_classify("Circular CSSF 12-02 on money laundering", source_id="cssf"), "cssfaml")
        self.assertEqual(_classify("Circular CSSF 26/910 on liquidity management tools", source_id="cssf"), "lulmt")
        # Andere Quellen behalten den Fallback auf die generischen Regeln.
        self.assertEqual(_classify("Reporting of major ICT-related incidents under DORA", source_id="esma"), "doraincident")

    def test_dora_third_country_branches(self):
        from regradar.webexport import _classify
        self.assertEqual(_classify("Application of the Digital Operational Resilience Act (DORA) to third-country branches"), "dora")
        self.assertEqual(_classify("Guidelines on the authorisation of third-country branches under CRD VI"), "ebatcb")

    def test_reply_form_is_noise(self):
        from regradar.webexport import _classify
        self.assertIsNone(_classify("Consultation paper on the reporting framework under EMIR - Reply form"))

    def test_title_key_ignores_suffixes(self):
        from regradar.webexport import _title_key
        self.assertEqual(_title_key("ESMA authorises EuroCTP - Press release"), _title_key("ESMA authorises EuroCTP"))
        self.assertEqual(_title_key("Circular CSSF 25/882 (Updated)"), _title_key("Circular CSSF 25/882"))

    def test_praxis_excludes_bilanzkontrolle(self):
        from regradar.webexport import PRAXIS_EXCLUDE
        for t in ("Zalando SE: Bafin macht Fehler im Konzernabschluss bekannt",
                  "pferdewetten.de AG: Bafin setzt Geldbuße fest Halbjahresfinanzbericht nicht rechtzeitig veröffentlicht",
                  "Dermapharm: Bafin leitet Prüfung des Konzernabschlusses 2025 ein",
                  "Brown Capital: Geldbuße wegen unterlassener Stimmrechtsmitteilungen",
                  "TeamViewer SE: Geldbuße, Insiderinformation nicht rechtzeitig als Ad-hoc-Mitteilung veröffentlicht"):
            self.assertTrue(PRAXIS_EXCLUDE.search(t), t)
        for t in ("bunq B. V.: Bafin setzt Bußgeld fest, unterlassene Meldungen an den Kontenvergleich",
                  "Nord/LB: Bafin ordnet Mängelbeseitigung in der Geldwäscheprävention an",
                  "Effecta GmbH: Geldbuße wegen Verstoß gegen die PRIIPs-VO"):
            self.assertFalse(PRAXIS_EXCLUDE.search(t), t)

    def test_esma_library_shadow_of_news(self):
        from regradar.webexport import _is_shadow, _title_tokens
        news = [("2026-08-18", _title_tokens("ESMA consults on reporting framework for clearing activity at recognised third-country CCPs"))]
        self.assertTrue(_is_shadow("Consultation paper on the reporting framework under EMIR for clearing activity at recognised third-country CCPs", "2026-08-18", news))
        self.assertTrue(_is_shadow("ESMA authorises EuroCTP as the Consolidated Tape Provider - Press release", "2026-07-28",
                                   [("2026-07-27", _title_tokens("ESMA authorises EuroCTP as the Consolidated Tape Provider for shares and exchange-traded funds"))]))
        self.assertFalse(_is_shadow("Guidelines on MiFID II suitability requirements", "2026-08-18", news))
        self.assertFalse(_is_shadow("Consultation paper on the reporting framework under EMIR", "2026-09-18", news))

    def test_praxis_sources(self):
        from regradar.webexport import PRAXIS_SOURCES
        self.assertIn("bafin", PRAXIS_SOURCES)
        self.assertNotIn("bgbl", PRAXIS_SOURCES)

    def test_unusable_llm_summary(self):
        from regradar.summarize import usable
        self.assertFalse(usable("Der Text enthält keine Informationen über den Inhalt der Meldung."))
        self.assertFalse(usable("Der Text enthält lediglich einen Titel."))
        self.assertTrue(usable("Die BaFin hat die 9. MaRisk-Novelle veröffentlicht."))

    def test_eiopa_page_date(self):
        from regradar.adapters.eiopa import page_publication_date
        html = '<time datetime="2025-04-29T12:00:00Z">29 April 2025</time> <time datetime="2025-07-31T21:59:59Z">31 July</time>'
        self.assertEqual(page_publication_date(html), "2025-04-29")
        self.assertIsNone(page_publication_date("<p>kein Datum</p>"))
