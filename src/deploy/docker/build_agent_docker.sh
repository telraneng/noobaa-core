#!/bin/bash

distro=$1
base_install=""

if [[ "$distro" == "ubuntu" ]]
then
    base_install='apt-get -y update && apt-get -y install less vim curl wget make python gcc g++'
elif [[ "$distro" == "centos" ]]
    base_install='yum -y update && yum -y install less vim curl wget make python gcc gcc-c++'
else
    echo "Unsupported distro: $distro"
    exit 1
fi

docker pull $distro
docker stop agent-$distro
docker rm agent-$distro
docker run --name agent-$distro -d -v $PWD:/noobaa-core $distro /sbin/init
docker exec -it agent-$distro bash << EOF
    $base_install
EOF

# nvm
touch /etc/profile.d/nvm.sh
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.5/install.sh | NVM_DIR=/nvm PROFILE=/etc/profile.d/nvm.sh bash
. /nvm/nvm.sh
nvm install $(cat /noobaa-core/.nvmrc)

# golang
wget https://storage.googleapis.com/golang/go1.9.linux-amd64.tar.gz
tar -C /usr/local -xzf go1.9.linux-amd64.tar.gz
rm -f go1.9.linux-amd64.tar.gz
echo 'export PATH=/usr/local/go/bin:$PATH' > /etc/profile.d/golang.sh

# profile
useradd nb -m -s /bin/bash
echo '. /etc/profile' >> /root/.bashrc
echo '. /etc/profile' >> /home/nb/.bashrc

# rebuild
su -l nb
export WORKSPACE=~/noobaa-core
rm -rf $WORKSPACE
mkdir -p $WORKSPACE
cd $WORKSPACE
cp -r /noobaa-core/{src,package.json,npm-shrinkwrap.json,binding.gyp,config.js,.nvmrc,LICENSE} .
bash -l ./src/deploy/agent_linux/build_agent_linux.sh
