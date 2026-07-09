ARG BASE_IMAGE_VERSION
FROM geonode/geoserver:${BASE_IMAGE_VERSION}

ARG BASE_IMAGE_VERSION
RUN apt-get update && apt-get install -y unzip wget && \
    VERSION=$(echo "${BASE_IMAGE_VERSION}" | cut -d'-' -f1) && \
    wget -q -O /tmp/netcdf.zip "https://downloads.sourceforge.net/project/geoserver/GeoServer/${VERSION}/extensions/geoserver-${VERSION}-netcdf-plugin.zip" && \
    unzip -o /tmp/netcdf.zip -d /usr/local/tomcat/webapps/geoserver/WEB-INF/lib/ && \
    rm -f /tmp/netcdf.zip && \
    apt-get clean && rm -rf /var/lib/apt/lists/*