FROM ubuntu:latest
SHELL [ "/bin/bash", "-c" ]
ENV BASH_ENV '/etc/profile'

# apt
RUN apt-get -y update && \
    apt-get -y install less vim curl wget make python gcc g++

# golang
RUN wget -nv https://storage.googleapis.com/golang/go1.9.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go1.9.linux-amd64.tar.gz && \
    rm -f go1.9.linux-amd64.tar.gz && \
    echo 'export PATH=/usr/local/go/bin:$PATH' >/etc/profile.d/golang.sh

# nvm
ADD .nvmrc ./
RUN touch /etc/profile.d/nvm.sh && \
    curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.5/install.sh | NVM_DIR=/nvm PROFILE=/etc/profile.d/nvm.sh bash
RUN nvm install

# user
RUN useradd noobaa --create-home --shell /bin/bash
USER noobaa
WORKDIR /home/noobaa

# workspace
ENV WORKSPACE /home/noobaa/noobaa-core
RUN mkdir $WORKSPACE
WORKDIR $WORKSPACE

# build
ADD package.json \
    npm-shrinkwrap.json \
    binding.gyp \
    config.js \
    .nvmrc \
    LICENSE \
    ./
ADD src/ src/
RUN ./src/deploy/agent_linux/build_agent_linux.sh

# setup
# USER root
# RUN /home/noobaa/noobaa-core/build/agent_linux/noobaa-setup-2.0.0-DEVONLY
# ENTRYPOINT [ "/sbin/init" ]
# USER noobaa
VOLUME [ "/noobaa-core" ]
# ENTRYPOINT [ "/sbin/init" ]
CMD [ "/sbin/init" ]
