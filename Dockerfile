ARG TODO_NODE_VERSION
FROM bmacnaughton/node:2.1.0

# set this to something different to force rebuilds at this point.
#ARG TODO_REFETCH
# get the application, extract it, move it, and name the dir todo
#RUN REFETCH=${TODO_REFETCH} cd $HOME && \
#    curl -LkSs https://api.github.com/repos/bmacnaughton/todomvc-mongodb/tarball -o todo.tar.gz && \
#    mkdir -p tmp && tar -zvxf todo.tar.gz -C tmp && \
#    mv tmp/$(ls -t tmp/ | head -1) $HOME/todo

ARG TODO_REFETCH
RUN TODO_REFETCH=${TODO_REFETCH} env
RUN mkdir -p /home/node/todo/
COPY --chown=node * /home/node/todo/

# change to force reinstall of todo dependencies.
ARG TODO_REINSTALL
RUN X=${TODO_REINSTALL} cd $HOME/todo && \
    source ~/.nvm/nvm.sh && \
    npm install .

#
# most of the heavy lifting part of building the image is done now, so set the
# environment up now. that allows docker to use the cached images prior to this
# point when changing only the environment variables.
#
ARG TODO_MONGODB_ADDRESS
ARG APPOPTICS_COLLECTOR
ARG APPOPTICS_REPORTER

ENV TODO_MONGODB_ADDRESS ${TODO_MONGODB_ADDRESS:-mongo_2_4:27017}
ENV APPOPTICS_COLLECTOR $APPOPTICS_COLLECTOR
ENV APPOPTICS_REPORTER $APPOPTICS_REPORTER

# persisted in the environment
ENV APPOPTICS_SERVICE_KEY $TODO_SERVICE_KEY
ENV DEBUG=${TODO_DEBUG:-appoptics:error,appoptics:warn,appoptics:debug}

CMD ["/bin/bash", "-c", "cd $HOME/todo && source ~/.nvm/nvm.sh && node server --be_ip=${TODO_MONGODB_ADDRESS} -r 100 ${TODO_SERVER_OPTIONS}"]


