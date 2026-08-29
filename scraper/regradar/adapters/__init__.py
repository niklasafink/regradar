from .rss import RssAdapter
from .eurlex import EurLexAdapter
from .gii import GiiAdapter
from .dip import DipAdapter
from .rii import RiiAdapter
from .amla import AmlaAdapter
from .eiopa import EiopaAdapter
from .bmf import BmfAdapter
from .curia import CuriaAdapter
from .hys import HysAdapter
from .ebaqna import EbaQnaAdapter
from .esmalib import EsmaLibAdapter
from .iosco import IoscoAdapter
from .dsnews import DsNewsAdapter

ADAPTERS = {
    "rss": RssAdapter,
    "eurlex": EurLexAdapter,
    "gii": GiiAdapter,
    "dip": DipAdapter,
    "rii": RiiAdapter,
    "amla": AmlaAdapter,
    "eiopa": EiopaAdapter,
    "bmf": BmfAdapter,
    "curia": CuriaAdapter,
    "hys": HysAdapter,
    "ebaqna": EbaQnaAdapter,
    "esmalib": EsmaLibAdapter,
    "iosco": IoscoAdapter,
    "dsnews": DsNewsAdapter,
}
