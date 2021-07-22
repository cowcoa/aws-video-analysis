#!/bin/bash
# Init local development env.

# Set "local" to avoid the warning "Failed to set locale, defaulting to C"
sudo sh -c "echo LANG=en_US.utf-8 >> /etc/environment"
sudo sh -c "echo LC_ALL=en_US.utf-8 >> /etc/environment"

echo "export LANG=en_US.UTF-8" >> /home/ec2-user/.bashrc
echo "export LANGUAGE=en_US.UTF-8" >> /home/ec2-user/.bashrc
echo "export LC_COLLATE=C" >> /home/ec2-user/.bashrc
echo "export LC_CTYPE=en_US.UTF-8" >> /home/ec2-user/.bashrc
source /home/ec2-user/.bashrc

# Merge bashrc and bash_profile
echo "" >> /home/ec2-user/.bash_profile
echo "# Refresh bashrc" >> /home/ec2-user/.bash_profile
echo "if [ -f /home/ec2-user/.bashrc ]; then" >> /home/ec2-user/.bash_profile
echo "        source /home/ec2-user/.bashrc" >> /home/ec2-user/.bash_profile
echo "fi" >> /home/ec2-user/.bash_profile
echo "" >> /home/ec2-user/.bash_profile

# Update packages.
sudo yum -y update
# Install gcc, gcc-c++ and gdb
sudo yum -y install gcc
sudo yum -y install gcc-c++
sudo yum -y install libstdc++
sudo yum -y install glibc-devel
sudo yum -y install gdb
# Install gnu auto build system
sudo yum -y install autoconf
sudo yum -y install automake
sudo yum -y install libtool
# Install cmake build system
sudo yum -y install cmake3
sudo ln -s /usr/bin/cmake3 /usr/bin/cmake
# Install git
sudo yum -y install git
# Install dos2unix tool
sudo yum -y install dos2unix
# Install jq for parsing json from bash shell script
sudo yum -y install jq
# Install docker
sudo amazon-linux-extras install docker

# Change timezone
sudo mv /etc/localtime /etc/localtime.bak
sudo ln -s /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# Enable core dump
ulimit -c unlimited
echo "ulimit -c unlimited" >> /home/ec2-user/.bashrc
