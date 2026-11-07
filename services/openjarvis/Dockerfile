FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    OPENJARVIS_HOME=/data/openjarvis \
    OPENJARVIS_API_KEY=""

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv

WORKDIR /opt/openjarvis
COPY vendor/OpenJarvis/ /opt/openjarvis/

RUN uv sync --frozen --no-dev --extra server

RUN useradd --create-home --uid 10001 jarvis \
    && mkdir -p /data/openjarvis \
    && chown -R jarvis:jarvis /data/openjarvis /opt/openjarvis

USER jarvis
EXPOSE 8787

CMD ["uv", "run", "--project", "/opt/openjarvis", "jarvis", "serve", "--host", "0.0.0.0", "--port", "8787"]
