"""Bounded source-page/map archive for the local 7C.6d geographic review."""
import fetch_continent_geography as fetch
from build_reviewed_continent_masks import OUTPUT, SOURCE_PAGES


def main():
    fetch.OUTPUT = OUTPUT / "sources"
    fetch.INPUTS = [
        ("land-documentation.html", SOURCE_PAGES["land"], 250_000),
        ("countries-documentation.html", SOURCE_PAGES["countries"], 250_000),
        ("null-island-release-notes.html", SOURCE_PAGES["null-island"], 250_000),
        ("shelves-documentation.html", SOURCE_PAGES["shelves"], 250_000),
        ("land-source-map.gif", "https://www.naturalearthdata.com/wp-content/uploads/2009/09/land_banner.gif", 500_000),
        ("countries-source-map.png", "https://www.naturalearthdata.com/wp-content/uploads/2009/09/banner_countries.png", 500_000),
        ("shelves-source-map.gif", "https://www.naturalearthdata.com/wp-content/uploads/2009/09/antarctic_ice_shelves_wide.gif", 500_000),
    ]
    fetch.main()


if __name__ == "__main__":
    main()
