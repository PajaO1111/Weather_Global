"""Ellipsoidal surface area for the lon/lat-linear polygons used by GEOS."""
import math

import numpy as np

from build_continent_masks import GEOD, source_parts

NODES, QUADRATURE_WEIGHTS = np.polynomial.legendre.leggauss(8)


def lonlat_area(geometry):
    """Integrate each ring without replacing parallels by geodesic chords.

    Dateline polygons must already be split at +/-180, as in the pinned land.
    Integration is invariant to adding collinear lon/lat vertices.
    """
    a = GEOD.a
    e2 = GEOD.f * (2 - GEOD.f)
    e = math.sqrt(e2)

    def ring_area(ring):
        coords = np.radians(np.asarray(ring.coords))
        delta = np.diff(coords, axis=0)
        total = np.zeros(len(delta))
        for node, weight in zip(NODES, QUADRATURE_WEIGHTS):
            phi = coords[:-1, 1] + (node + 1) * .5 * delta[:, 1]
            sine = np.sin(phi)
            primitive = a * a * (1 - e2) * .5 * (
                sine / (1 - e2 * sine * sine) + np.arctanh(e * sine) / e)
            total += weight * primitive
        return abs(float(np.sum(total * delta[:, 0]) * .5))

    return sum(max(0.0, ring_area(g.exterior) - sum(ring_area(r) for r in g.interiors))
               for g in source_parts(geometry))
